'use strict';

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const { Api } = require('telegram');

const db = require('../../config/database');
const logger = require('../../config/logger');
const { classifyMessage } = require('../ai/classifier');
const { createNotification } = require('../notifications/notifier');
const { emitToAdmins } = require('../../utils/socket');
const MessageQueue = require('./messageQueue');

// ─── Active Clients Registry ───────────────────────────────────────────────────
/** @type {Map<string, TelegramClient>} accountId -> TelegramClient */
const activeClients = new Map();
const messageQueue = new MessageQueue(handleNewMessage, 8);

// ─── In-Memory Dedup Cache ────────────────────────────────────────────────────
// Prevents the same message from being processed twice when multiple accounts
// receive it simultaneously (race condition that DB dedup cannot catch).
/** @type {Map<string, number>} dedupKey -> timestamp */
const recentMessageCache = new Map();
const DEDUP_CACHE_TTL_MS = 30 * 1000; // 30 seconds
const DEDUP_CACHE_CLEANUP_INTERVAL = 60 * 1000; // clean every 60 seconds

// Periodically clean expired entries from the dedup cache
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentMessageCache) {
    if (now - ts > DEDUP_CACHE_TTL_MS) {
      recentMessageCache.delete(key);
    }
  }
}, DEDUP_CACHE_CLEANUP_INTERVAL);

// ─── Sleep Helper ──────────────────────────────────────────────────────────────
/**
 * Sleeps for a given number of seconds.
 * @param {number} seconds
 * @returns {Promise<void>}
 */
const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

// ─── HTML escaping helper ──────────────────────────────────────────────────────
/**
 * Escapes special HTML characters to prevent Telegram API parsing errors.
 * @param {string} text
 * @returns {string}
 */
const escapeHtml = (text) => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

// ─── Channel Forwarding Helper ──────────────────────────────────────────────────
/**
 * Forwards a request to the configured Telegram channel.
 * @param {Object} request - Saved request DB object
 */
const forwardRequestToChannel = async (request) => {
  try {
    const setting = await db.systemSetting.findUnique({
      where: { key: 'FORWARD_CHANNEL_ID' }
    });
    
    const channelId = setting ? setting.value : process.env.FORWARD_CHANNEL_ID;
    if (!channelId) {
      logger.debug('No FORWARD_CHANNEL_ID configured. Skipping forwarding.');
      return;
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      logger.warn('TELEGRAM_BOT_TOKEN not configured. Cannot forward message.');
      return;
    }

    // Build display name: prefer @username, fallback to cleaned name
    let displayName = 'مجهول';
    if (request.senderUsername) {
      displayName = `@${request.senderUsername}`;
    } else if (request.senderName && request.senderName !== 'Unknown') {
      displayName = request.senderName.replace(/\s*\([^)]+\)/, '').trim();
    }
    
    // Escape display name to avoid HTML parsing errors
    displayName = escapeHtml(displayName);

    // Direct message link
    const directMessageLink = request.senderUsername 
      ? `https://t.me/${request.senderUsername}` 
      : (request.senderId && request.senderId !== 'unknown' ? `tg://user?id=${request.senderId}` : null);

    // Make display name a clickable link
    const nameLink = directMessageLink 
      ? `<a href="${directMessageLink}">${displayName}</a>`
      : displayName;

    // Escape message text to avoid HTML parsing errors
    const escapedMessageText = escapeHtml(request.messageText);

    // Format the message — OLD compact format matching user's screenshot
    const formattedMessageLines = [
      `👤 <b>${nameLink}</b>`,
      `المرسل : ID <code>${request.senderId}</code>\n`,
      `نص الرساله :`,
      escapedMessageText,
    ];

    // Add group info if available
    if (request.groupLink) {
      const escapedGroupName = escapeHtml(request.groupName || 'مجموعة');
      formattedMessageLines.push(`المجموعة : <a href="${request.groupLink}">${escapedGroupName}</a>`);
    }

    // Add message link
    formattedMessageLines.push(`رابط الرساله : ${request.messageLink || 'غير متوفر'}`);

    const formattedMessage = formattedMessageLines.join('\n');

    // Build buttons row: [ عرض الرسالة ] and [ رسالة خاصة ] side-by-side
    const buttons = [];

    // Original message link — always first button if available
    if (request.messageLink && (request.messageLink.startsWith('http://') || request.messageLink.startsWith('https://') || request.messageLink.startsWith('tg://'))) {
      buttons.push({
        text: '🔗 عرض الرسالة',
        url: request.messageLink
      });
    }
    
    // Direct message link — use username if available, otherwise use tg://user?id= for users with ID
    if (request.senderUsername) {
      buttons.push({
        text: '📱 رسالة خاصة',
        url: `https://t.me/${request.senderUsername}`
      });
    } else if (request.senderId && request.senderId !== 'unknown') {
      // tg://user?id= works as a URL button for users without public username
      buttons.push({
        text: '📱 رسالة خاصة',
        url: `tg://user?id=${request.senderId}`
      });
    }

    const reply_markup = buttons.length > 0 ? {
      inline_keyboard: [buttons]
    } : undefined;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: formattedMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup
      }),
    });

    const resJson = await response.json();
    if (!resJson.ok) {
      logger.error('Telegram API error when forwarding request:', resJson);
    } else {
      logger.info(`✅ Request ${request.id} forwarded to channel ${channelId}`);
    }
  } catch (err) {
    logger.error('Failed to forward request to Telegram channel', { error: err.message });
  }
};

/**
 * Parses a forwarded message format to extract original request details if present.
 * @param {string} text - Raw message text
 * @returns {Object|null} Parsed details or null
 */
const parseForwardedFormat = (text) => {
  // Normalize spelling of الرسالة/الرساله and spaces
  const normalizedText = text.replace(/نص\s+الرسال[ةه]\s*:/i, 'نص الرساله :');
  if (!normalizedText.includes('نص الرساله :')) return null;

  try {
    const lines = text.split('\n');
    let senderName = null;
    let senderId = null;
    let senderUsername = null;
    let messageText = '';
    let messageLink = null;

    // 1. Extract Sender Name
    // Pattern A: line starting with 👤
    const senderLine = lines.find(l => l.includes('👤'));
    if (senderLine) {
      senderName = senderLine.replace('👤', '').trim();
    }
    // Pattern B: line containing الاسم
    if (!senderName) {
      const nameLine = lines.find(l => l.startsWith('الاسم :') || l.includes('الاسم:'));
      if (nameLine) {
        senderName = nameLine.split(':')[1]?.trim();
      }
    }

    // 2. Extract Username
    // Check if any line contains @username or if there is a line starting with المرسل
    const senderFieldLine = lines.find(l => l.startsWith('المرسل :') || l.includes('المرسل:'));
    if (senderFieldLine) {
      const fieldVal = senderFieldLine.split(':')[1]?.trim();
      if (fieldVal && fieldVal.includes('@')) {
        const match = fieldVal.match(/@(\w+)/);
        if (match) {
          senderUsername = match[1];
        }
      }
    }

    // 3. Extract Sender ID
    // Look for any line containing ID followed by numbers
    const idLine = lines.find(l => /id/i.test(l) && /\d+/.test(l));
    if (idLine) {
      const match = idLine.match(/\d+/);
      if (match) {
        senderId = match[0];
      }
    }

    // 4. Find message text and link
    const textIndex = normalizedText.indexOf('نص الرساله :');
    const linkIndex = normalizedText.replace(/رابط\s+الرسال[ةه]\s*:/i, 'رابط الرساله :').indexOf('رابط الرساله :');

    if (textIndex !== -1) {
      if (linkIndex !== -1 && linkIndex > textIndex) {
        messageText = normalizedText.substring(textIndex + 'نص الرساله :'.length, linkIndex).trim();
        messageLink = normalizedText.substring(linkIndex + 'رابط الرساله :'.length).trim();
      } else {
        messageText = normalizedText.substring(textIndex + 'نص الرساله :'.length).trim();
      }
    }

    // Clean up HTML tags from senderName if any
    if (senderName) {
      senderName = senderName.replace(/<\/?[^>]+(>|$)/g, "").trim();
    }

    if (messageText) {
      return {
        senderName: senderName || 'مجهول',
        senderId: senderId || 'unknown',
        senderUsername: senderUsername || null,
        messageText,
        messageLink
      };
    }
  } catch (err) {
    logger.debug('Error parsing forwarded format:', err.message);
  }
  return null;
};

// ─── Message Handler ───────────────────────────────────────────────────────────
/**
 * Processes an incoming Telegram message event.
 * Classifies the message with AI. If it's a valid request, saves it to DB and
 * emits real-time events.
 *
 * @param {Object} event - NewMessage event from gramJS
 * @param {TelegramAccount} account - DB account object
 * @param {TelegramClient} client - Active gramJS client
 */
async function handleNewMessage(event, account, client) {
  try {
    const message = event.message;

    // Skip empty, service messages, or outgoing messages
    if (!message || !message.message || message.out) return;

    const rawMessageText = message.message.trim();
    if (!rawMessageText || rawMessageText.length < 5) return;

    const groupId = String(message.chatId || '');
    if (!groupId) return;

    // Prevent loop: check template format from bot's own messages
    if (rawMessageText.includes('طلب محتمل:') || rawMessageText.includes('طلب جديد') || rawMessageText.includes('روابط سريعة:')) {
      return;
    }

    // Prevent loop: check if forwarding channel
    const setting = await db.systemSetting.findUnique({
      where: { key: 'FORWARD_CHANNEL_ID' }
    });
    const forwardChannelId = setting ? setting.value : process.env.FORWARD_CHANNEL_ID;

    if (forwardChannelId) {
      const normGroupId = groupId.replace('-100', '');
      const normForwardId = String(forwardChannelId).replace('-100', '');
      if (normGroupId === normForwardId) {
        return;
      }
    }

    // Check if this group is in our monitored list in DB first (no Telegram API call)
    const monitoredGroup = await db.monitoredGroup.findFirst({
      where: { groupId, accountId: account.id, isActive: true },
    });

    if (!monitoredGroup) {
      // Quietly skip unmonitored groups to avoid log flooding
      return;
    }

    const groupName = monitoredGroup.groupName || 'Unknown Group';

    logger.info(`Incoming msg from ${account.phone} (chat ${groupId}): "${rawMessageText.substring(0, 50)}..."`);

    // Parse forwarded format if present (e.g. from S_boot bot forwards)
    const parsedForward = parseForwardedFormat(rawMessageText);
    const messageText = parsedForward ? parsedForward.messageText : rawMessageText;

    if (!messageText || messageText.length < 5) return;

    // ─── Fast In-Memory Dedup ─────────────────────────────────────────────────
    // Build a key from senderId + messageText to catch the same message arriving
    // from multiple listener accounts within seconds of each other.
    const parsedSenderId = parsedForward ? parsedForward.senderId : (message.fromId ? String(message.fromId.userId || message.fromId.channelId || '') : '');
    const dedupKey = `${parsedSenderId}:${groupId}:${messageText.substring(0, 100)}`;
    if (recentMessageCache.has(dedupKey)) {
      logger.debug(`Fast-dedup: skipping already-processed message in "${groupName}" from account ${account.phone}`);
      return;
    }
    recentMessageCache.set(dedupKey, Date.now());

    // ─── Enhanced Sender Extraction (multi-attempt) ────────────────────────────
    let senderName = parsedForward ? parsedForward.senderName : 'مجهول';
    let senderUsername = parsedForward ? (parsedForward.senderUsername || null) : null;
    let senderId = parsedForward ? parsedForward.senderId : 'unknown';
    let senderPhone = null;
    let messageLink = parsedForward ? parsedForward.messageLink : null;
    let groupUsername = null;
    let groupLink = null;
    const rawMessageId = message.id ? String(message.id) : null;

    // Extract username from parsed name if it contains @
    if (parsedForward && parsedForward.senderName) {
      const usernameMatch = parsedForward.senderName.match(/@(\w+)/);
      if (usernameMatch) {
        senderUsername = usernameMatch[1];
      }
    }

    if (!parsedForward) {
      // Always extract senderId from message.fromId first (guaranteed available)
      if (message.fromId) {
        senderId = String(message.fromId.userId || message.fromId.channelId || 'unknown');
      }

      // ─── PARALLEL sender + chat extraction for SPEED ─────────────────────────
      const FAST_TIMEOUT = 3000; // 3s max
      const senderPromise = (async () => {
        // Attempt 1: getSender()
        try {
          return await Promise.race([
            event.getSender(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), FAST_TIMEOUT))
          ]);
        } catch (e) {
          logger.debug(`getSender() failed: ${e.message}`);
        }
        // Attempt 2: client.getEntity() fallback
        if (message.fromId && client) {
          try {
            return await Promise.race([
              client.getEntity(message.fromId),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ]);
          } catch (e) {
            logger.debug(`getEntity() fallback failed: ${e.message}`);
          }
        }
        return null;
      })();

      const chatPromise = (async () => {
        try {
          return await Promise.race([
            event.getChat(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), FAST_TIMEOUT))
          ]);
        } catch (e) {
          logger.debug(`getChat() failed: ${e.message}`);
          return null;
        }
      })();

      // Run BOTH in parallel — saves ~3-5 seconds per message!
      const [sender, chat] = await Promise.all([senderPromise, chatPromise]);

      // Extract sender info
      if (sender) {
        senderPhone = sender.phone || null;
        const firstName = sender.firstName || '';
        const lastName = sender.lastName || '';
        let name = [firstName, lastName].filter(Boolean).join(' ') || sender.title || '';
        if (!name && senderPhone) {
          name = `+${senderPhone.replace(/^\+/, '')}`;
        }
        senderName = name || 'مجهول';
        if (senderPhone && name && !name.includes(senderPhone)) {
          senderName += ` (+${senderPhone.replace(/^\+/, '')})`;
        }
        senderUsername = sender.username || null;
        senderId = sender.id ? String(sender.id) : senderId;
      }

      // Log extraction failure for debugging
      if (senderName === 'مجهول' && senderId === 'unknown') {
        logger.warn(`Failed to extract ANY sender info for message in ${groupName}`, {
          hasFromId: !!message.fromId,
          messageId: message.id,
        });
      }

      // Extract chat/group info
      if (chat) {
        groupUsername = chat.username || null;
        if (groupUsername) {
          groupLink = `https://t.me/${groupUsername}`;
          messageLink = message.id ? `https://t.me/${groupUsername}/${message.id}` : null;
        } else {
          const channelId = String(chat.id).replace('-100', '').replace('-', '');
          messageLink = message.id ? `https://t.me/c/${channelId}/${message.id}` : null;
          groupLink = `المجموعة خاصة (ID: ${groupId})`;
        }
      }
    }

    // Build links
    const profileLink = senderUsername
      ? `https://t.me/${senderUsername}`
      : (senderId !== 'unknown' ? `tg://user?id=${senderId}` : null);

    // Update monitored group with username/link if we found one
    if (groupUsername && monitoredGroup) {
      db.monitoredGroup.update({
        where: { id: monitoredGroup.id },
        data: { groupUsername, groupLink, isPublic: true },
      }).catch(() => {});
    }

    // Classify the message
    const classification = await classifyMessage(messageText, {
      senderName,
      groupName,
    });

    const { isRequest, isAdvertiser, serviceType, confidenceScore, keywords, priority } = classification;

    logger.info(`Classification result for msg in "${groupName}" (chat ${groupId}): isRequest=${isRequest}, confidence=${confidenceScore}, service=${serviceType}`);

    // Only save if it's a request (not spam/ads) with sufficient confidence
    if (!isRequest || confidenceScore < 0.50) {
      if (isAdvertiser) {
        logger.info(`Msg in "${groupName}" skipped: classified as advertiser.`);
      } else {
        logger.info(`Msg in "${groupName}" skipped: not a request or confidence too low (${confidenceScore}).`);
      }
      return;
    }

    // Deduplication: avoid duplicate requests from the same sender within the last 12 hours
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const duplicateRequest = await db.request.findFirst({
      where: {
        AND: [
          { messageText },
          { capturedAt: { gte: twelveHoursAgo } },
          {
            OR: [
              { senderId },
              { senderPhone },
              { senderUsername },
            ],
          },
        ],
      },
    });
    if (duplicateRequest) {
      logger.info(`Skipping duplicate request from same sender in "${groupName}" captured within 12h.`);
      return;
    }

    // Calculate expiry (48 hours from now)
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // Save to database
    let request;
    try {
      request = await db.request.create({
        data: {
          messageText,
          senderName,
          senderUsername,
          senderId,
          senderPhone,
          profileLink,
          messageLink,
          groupName,
          groupId,
          groupUsername: groupUsername || null,
          groupLink: groupLink || null,
          messageId: rawMessageId || null,
          country: monitoredGroup.country || null,
          serviceType,
          confidenceScore,
          keywords,
          status: 'NEW',
          priority,
          isAdvertiser: false,
          expiresAt,
          accountPhone: account.phone,
        },
      });
    } catch (dbErr) {
      logger.error('Failed to save request to database:', { error: dbErr.message, stack: dbErr.stack });
      return;
    }

    logger.info('New request captured', {
      requestId: request.id,
      serviceType,
      confidence: confidenceScore,
      group: groupName,
    });

    // Emit real-time event to all connected admin clients
    emitToAdmins('new_request', {
      request,
      classification,
    });

    // Forward to Telegram channel if configured
    await forwardRequestToChannel(request);

    // Notify all active admin users
    const admins = await db.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });

    await Promise.allSettled(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          requestId: request.id,
          type: 'NEW_REQUEST',
          message: `طلب جديد في ${groupName}: "${messageText.substring(0, 80)}${messageText.length > 80 ? '...' : ''}"`,
        })
      )
    );

    // Update account lastSeen
    await db.telegramAccount.update({
      where: { id: account.id },
      data: { lastSeen: new Date() },
    }).catch(() => {});
  } catch (err) {
    logger.error('Error handling Telegram message', { error: err.message, stack: err.stack });
  }
}

// ─── Create Client for Account ─────────────────────────────────────────────────
/**
 * Creates and connects a TelegramClient for the given account.
 * @param {Object} account - TelegramAccount DB record
 * @returns {Promise<TelegramClient|null>}
 */
const createClientForAccount = async (account) => {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
  const apiHash = process.env.TELEGRAM_API_HASH || '';

  if (!apiId || !apiHash) {
    logger.error('TELEGRAM_API_ID or TELEGRAM_API_HASH not configured');
    return null;
  }

  try {
    const session = new StringSession(account.sessionString);
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      retryDelay: 1000,
      autoReconnect: true,
      useWSS: false,
    });

    await client.connect();

    if (!(await client.isUserAuthorized())) {
      logger.warn(`Account ${account.phone} is not authorized. Skipping.`);
      await client.disconnect();
      return null;
    }

    logger.info(`✅ Connected Telegram account: ${account.phone}`);

    // Register message handler via queue to throttle concurrency
    client.addEventHandler(
      (event) => messageQueue.enqueue(event, account, client),
      new NewMessage({ incoming: true })
    );

    // Handle disconnects with auto-reconnect
    client.setParseMode('html');

    // Automatically fetch and register all joined groups in the background
    (async () => {
      try {
        logger.info(`🔍 Scanning joined groups for account: ${account.phone}...`);
        
        const setting = await db.systemSetting.findUnique({
          where: { key: 'FORWARD_CHANNEL_ID' }
        });
        const forwardChannelId = setting ? setting.value : process.env.FORWARD_CHANNEL_ID;

        const dialogs = await client.getDialogs();
        let addedCount = 0;
        for (const dialog of dialogs) {
          if (dialog.isGroup || dialog.isChannel) {
            const groupId = String(dialog.id);
            const groupName = dialog.title || 'Unknown Group';

            // Skip if it's the forwarding channel
            if (forwardChannelId) {
              const normGroupId = groupId.replace('-100', '');
              const normForwardId = String(forwardChannelId).replace('-100', '');
              if (normGroupId === normForwardId) {
                continue;
              }
            }

            // Check if already exists in DB
            const existing = await db.monitoredGroup.findFirst({
              where: { accountId: account.id, groupId: groupId }
            });

            if (!existing) {
              const dialogUsername = dialog.entity?.username || null;
              await db.monitoredGroup.create({
                data: {
                  accountId: account.id,
                  groupId: groupId,
                  groupName: groupName,
                  groupUsername: dialogUsername,
                  groupLink: dialogUsername ? `https://t.me/${dialogUsername}` : null,
                  isPublic: !!dialogUsername,
                  isActive: true
                }
              });
              addedCount++;
            }
          }
        }
        if (addedCount > 0) {
          logger.info(`💾 Automatically registered ${addedCount} new group(s) for ${account.phone}`);
        } else {
          logger.info(`ℹ️ No new groups to register for ${account.phone}`);
        }
      } catch (dbErr) {
        logger.warn(`Failed to auto-register groups for ${account.phone}`, { error: dbErr.message });
      }
    })();

    return client;
  } catch (err) {
    if (err.errorMessage === 'FLOOD_WAIT') {
      const waitSeconds = err.seconds || 60;
      logger.warn(`FloodWaitError for ${account.phone}. Waiting ${waitSeconds}s.`);
      await sleep(waitSeconds);
      return createClientForAccount(account);
    }

    logger.error(`Failed to create client for ${account.phone}`, { error: err.message });
    return null;
  }
};

// ─── Start All Listeners ───────────────────────────────────────────────────────
/**
 * Loads all active Telegram accounts from the database and starts listeners.
 * @returns {Promise<void>}
 */
const startAllListeners = async () => {
  try {
    const accounts = await db.telegramAccount.findMany({
      where: { isActive: true },
    });

    if (accounts.length === 0) {
      logger.info('No active Telegram accounts found. Listeners not started.');
      return;
    }

    logger.info(`Starting listeners for ${accounts.length} Telegram account(s)...`);

    for (const account of accounts) {
      if (activeClients.has(account.id)) {
        logger.debug(`Listener already running for account ${account.phone}`);
        continue;
      }

      const client = await createClientForAccount(account);
      if (client) {
        activeClients.set(account.id, client);
      }

      // Small delay between account connections to avoid rate limiting
      await sleep(2);
    }

    logger.info(`✅ ${activeClients.size} Telegram listener(s) active`);
  } catch (err) {
    logger.error('Error in startAllListeners', { error: err.message });
    throw err;
  }
};

// ─── Add New Listener ──────────────────────────────────────────────────────────
/**
 * Adds a listener for a newly added Telegram account.
 * @param {Object} account - TelegramAccount DB record
 * @returns {Promise<boolean>} true if successful
 */
const addNewListener = async (account) => {
  if (activeClients.has(account.id)) {
    logger.debug(`Listener already exists for account ${account.phone}`);
    return true;
  }

  const client = await createClientForAccount(account);
  if (client) {
    activeClients.set(account.id, client);
    logger.info(`New listener added for ${account.phone}`);
    return true;
  }
  return false;
};

// ─── Remove Listener ──────────────────────────────────────────────────────────
/**
 * Disconnects and removes a listener for a given account.
 * @param {string} accountId
 */
const removeListener = async (accountId) => {
  const client = activeClients.get(accountId);
  if (client) {
    try {
      await client.disconnect();
    } catch (err) {
      logger.warn('Error disconnecting client', { accountId, error: err.message });
    }
    activeClients.delete(accountId);
    logger.info(`Listener removed for account: ${accountId}`);
  }
};

const checkListenersHealth = async () => {
  const report = { healthy: 0, unhealthy: 0, reconnected: 0 };

  for (const [accountId, client] of activeClients.entries()) {
    let isHealthy = false;
    try {
      if (client.connected) {
        // Ping Telegram with a fast query to check if connection is active and wake it up (keep-alive)
        await Promise.race([
          client.getMe(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Ping Timeout')), 4000))
        ]);
        isHealthy = true;
      }
    } catch (pingErr) {
      logger.warn(`Stale Telegram client detected for account ${accountId}: ${pingErr.message}`);
    }

    if (!isHealthy) {
      report.unhealthy++;
      // Try to disconnect and reconnect
      try {
        try {
          await client.disconnect();
        } catch (e) {}
        await client.connect();
        
        if (await client.isUserAuthorized()) {
          report.reconnected++;
          logger.info(`✅ Successfully reconnected and re-authorized Telegram client for account ${accountId}`);
        } else {
          logger.warn(`Account ${accountId} is not authorized after reconnect.`);
          activeClients.delete(accountId);
        }
      } catch (reconnectErr) {
        logger.error(`Failed to reconnect client for account ${accountId}:`, { error: reconnectErr.message });
        activeClients.delete(accountId);
      }
    } else {
      report.healthy++;
    }
  }

  return report;
};

module.exports = {
  startAllListeners,
  addNewListener,
  removeListener,
  checkListenersHealth,
  activeClients,
};

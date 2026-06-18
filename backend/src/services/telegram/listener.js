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

// ─── Active Clients Registry ───────────────────────────────────────────────────
/** @type {Map<string, TelegramClient>} accountId -> TelegramClient */
const activeClients = new Map();

// ─── Sleep Helper ──────────────────────────────────────────────────────────────
/**
 * Sleeps for a given number of seconds.
 * @param {number} seconds
 * @returns {Promise<void>}
 */
const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

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

    // Clean sender name or default to username
    const phoneMatch = request.senderName ? request.senderName.match(/\(([^)]+)\)/) : null;
    const phoneVal = request.senderPhone || (phoneMatch ? phoneMatch[1] : null);
    let cleanSenderName = request.senderName ? request.senderName.replace(/\s*\([^)]+\)/, '') : 'مجهول';
    if (request.senderUsername) {
      cleanSenderName = `@${request.senderUsername}`;
    }

    // Direct message link: use https://t.me/ for username, or tg://user?id= in the message text HTML anchor (safe)
    const directMessageLink = request.senderUsername 
      ? `https://t.me/${request.senderUsername}` 
      : (request.senderId && request.senderId !== 'unknown' ? `tg://user?id=${request.senderId}` : null);

    const nameLink = directMessageLink 
      ? `<a href="${directMessageLink}">${cleanSenderName}</a>`
      : cleanSenderName;

    // Format the message briefly to match user's screenshot exactly
    const formattedMessageLines = [
      `👤 <b>${nameLink}</b>`,
      `المرسل : ID <code>${request.senderId}</code>\n`,
      `نص الرساله :`,
      request.messageText,
      `رابط الرساله : ${request.messageLink || 'غير متوفر'}`
    ];

    const formattedMessage = formattedMessageLines.join('\n');

    // Build buttons row: [ رسالة خاصة ] (only if public username is available) and [ عرض الرسالة ] side-by-side
    const buttons = [];
    
    // Direct message link - ONLY if they have a public username to prevent BUTTON_USER_INVALID crash
    if (request.senderUsername) {
      buttons.push({
        text: '📱 رسالة خاصة',
        url: `https://t.me/${request.senderUsername}`
      });
    }

    // Original message link - only add if it is a valid URL scheme to prevent API crash
    if (request.messageLink && (request.messageLink.startsWith('http://') || request.messageLink.startsWith('https://') || request.messageLink.startsWith('tg://'))) {
      buttons.push({
        text: '🔗 عرض الرسالة',
        url: request.messageLink
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
  if (!text.includes('نص الرساله :')) return null;

  try {
    const lines = text.split('\n');
    let senderName = null;
    let senderId = null;
    let messageText = '';
    let messageLink = null;

    // Find sender name (line starting with 👤)
    const senderLine = lines.find(l => l.includes('👤'));
    if (senderLine) {
      senderName = senderLine.replace('👤', '').trim();
    }

    // Find sender ID (line containing ID)
    const idLine = lines.find(l => l.includes('المرسل') && l.includes('ID'));
    if (idLine) {
      const match = idLine.match(/\d+/);
      if (match) {
        senderId = match[0];
      }
    }

    // Find message text and link
    const textIndex = text.indexOf('نص الرساله :');
    const linkIndex = text.indexOf('رابط الرساله :');

    if (textIndex !== -1) {
      if (linkIndex !== -1 && linkIndex > textIndex) {
        messageText = text.substring(textIndex + 'نص الرساله :'.length, linkIndex).trim();
        messageLink = text.substring(linkIndex + 'رابط الرساله :'.length).trim();
      } else {
        messageText = text.substring(textIndex + 'نص الرساله :'.length).trim();
      }
    }

    if (messageText) {
      return {
        senderName,
        senderId: senderId || 'unknown',
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
const handleNewMessage = async (event, account, client) => {
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

    // Fetch sender info with a timeout to prevent hanging on Telegram API
    let senderName = parsedForward ? parsedForward.senderName : 'Unknown';
    let senderUsername = null;
    let senderId = parsedForward ? parsedForward.senderId : 'unknown';
    let senderPhone = null;

    // Extract username from parsed name if it contains @
    if (parsedForward && parsedForward.senderName) {
      const usernameMatch = parsedForward.senderName.match(/@(\w+)/);
      if (usernameMatch) {
        senderUsername = usernameMatch[1];
      }
    }

    if (!parsedForward) {
      try {
        const sender = await Promise.race([
          event.getSender(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
        ]).catch(() => null);

        if (sender) {
          senderPhone = sender.phone || null;
          let name = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.title || 'Unknown';
          if (senderPhone) {
            name += ` (${senderPhone.startsWith('+') ? '' : '+'}${senderPhone})`;
          }
          senderName = name;
          senderUsername = sender.username || null;
          senderId = sender.id ? String(sender.id) : 'unknown';
        } else if (message.fromId) {
          senderId = String(message.fromId.userId || message.fromId.channelId || 'unknown');
        }
      } catch (senderErr) {
        logger.debug(`Could not fetch sender info for message in ${groupName}: ${senderErr.message}`);
      }
    }

    // Build links
    const profileLink = senderUsername ? `https://t.me/${senderUsername}` : null;
    
    let messageLink = null;
    if (parsedForward) {
      messageLink = parsedForward.messageLink;
    } else {
      let chatUsername = null;
      try {
        const chat = await Promise.race([
          event.getChat(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500))
        ]).catch(() => null);
        if (chat) {
          chatUsername = chat.username || null;
        }
      } catch (e) {}

      messageLink = chatUsername && message.id
        ? `https://t.me/${chatUsername}/${message.id}`
        : null;
    }

    // Classify the message
    const classification = await classifyMessage(messageText, {
      senderName,
      groupName,
    });

    const { isRequest, isAdvertiser, serviceType, confidenceScore, keywords, priority } = classification;

    logger.info(`Classification result for msg in "${groupName}" (chat ${groupId}): isRequest=${isRequest}, confidence=${confidenceScore}, service=${serviceType}`);

    // Only save if it's a request (not spam/ads) with sufficient confidence
    if (!isRequest || confidenceScore < 0.65) {
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
};

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

    // Register message handler
    client.addEventHandler(
      (event) => handleNewMessage(event, account, client),
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
              await db.monitoredGroup.create({
                data: {
                  accountId: account.id,
                  groupId: groupId,
                  groupName: groupName,
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

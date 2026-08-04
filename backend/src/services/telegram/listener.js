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

// ─── Active Monitored Groups Memory Cache ──────────────────────────────────────
const monitoredGroupsCache = new Map();
const monitoredGroupsByTgId = new Map();

const refreshMonitoredGroupsCache = async () => {
  try {
    const activeGroups = await db.monitoredGroup.findMany({
      where: { isActive: true }
    });
    monitoredGroupsCache.clear();
    monitoredGroupsByTgId.clear();
    for (const g of activeGroups) {
      monitoredGroupsCache.set(`${g.accountId}_${g.groupId}`, g);
      const normId = String(g.groupId).replace('-100', '');
      monitoredGroupsByTgId.set(g.groupId, g);
      monitoredGroupsByTgId.set(normId, g);
      monitoredGroupsByTgId.set(`-100${normId}`, g);
    }
    logger.debug(`Loaded ${monitoredGroupsCache.size} active monitored groups into memory cache`);
  } catch (err) {
    logger.error('Failed to load monitored groups cache:', err);
  }
};

// Periodically refresh the monitored groups cache (every 2 minutes)
setInterval(refreshMonitoredGroupsCache, 2 * 60 * 1000);

// ─── Deduplicate Monitored Groups ──────────────────────────────────────────────
/**
 * Deduplicates monitored groups across multiple accounts.
 * Prioritizes keeping the group active on the official account (e.g. +967772612086).
 * If not on the official account, keeps it active on only one account and deactivates it on others.
 */
const deduplicateGroups = async () => {
  try {
    const officialPhone = process.env.OFFICIAL_PHONE || '+967772612086';
    const cleanPhone = (p) => p ? String(p).replace(/[^0-9]/g, '') : '';
    const cleanOfficial = cleanPhone(officialPhone);
    
    logger.info(`Monitored Groups Deduplication (Official: ${officialPhone})...`);
    
    const accounts = await db.telegramAccount.findMany();
    const officialAccount = accounts.find(acc => cleanPhone(acc.phone) === cleanOfficial);
    
    if (officialAccount) {
      logger.info(`Identified official account: ${officialAccount.phone}`);
    } else {
      logger.warn(`Could not find account matching official phone ${officialPhone}`);
    }

    const allGroups = await db.monitoredGroup.findMany();
    const groupsByTelegramId = {};
    for (const g of allGroups) {
      if (!groupsByTelegramId[g.groupId]) {
        groupsByTelegramId[g.groupId] = [];
      }
      groupsByTelegramId[g.groupId].push(g);
    }
    
    let deactivatedCount = 0;
    let activatedCount = 0;
    
    for (const tgGroupId in groupsByTelegramId) {
      const listings = groupsByTelegramId[tgGroupId];
      if (listings.length <= 1) continue;
      
      let activeListing = null;
      if (officialAccount) {
        activeListing = listings.find(l => l.accountId === officialAccount.id);
      }
      if (!activeListing) {
        activeListing = listings.find(l => l.isActive) || listings[0];
      }
      
      for (const listing of listings) {
        const shouldBeActive = (listing.id === activeListing.id);
        if (listing.isActive !== shouldBeActive) {
          await db.monitoredGroup.update({
            where: { id: listing.id },
            data: { isActive: shouldBeActive }
          });
          if (shouldBeActive) activatedCount++;
          else deactivatedCount++;
        }
      }
    }
    
    if (deactivatedCount > 0 || activatedCount > 0) {
      logger.info(`Monitored groups deduplicated: Activated ${activatedCount}, Deactivated ${deactivatedCount}`);
      await refreshMonitoredGroupsCache();
    } else {
      logger.debug(`Monitored groups deduplication: No duplicates needed updating`);
    }
  } catch (err) {
    logger.error('Error during monitored groups deduplication:', err);
  }
};

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

    // Build header line matching user's screenshot
    let headerLine = '';
    if (request.senderUsername) {
      headerLine = `👤 @${request.senderUsername}`;
    } else if (request.senderName && request.senderName !== 'Unknown' && request.senderName !== 'مجهول') {
      headerLine = `👤 الاسم: ${escapeHtml(request.senderName)}`;
    } else {
      headerLine = `👤 الاسم: Unknown`;
    }

    const escapedMessageText = escapeHtml(request.messageText);
    const messageLinkStr = request.messageLink || 'غير متوفر';

    const formattedMessageLines = [
      headerLine,
      `المرسل : ID <code>${request.senderId || 'مجهول'}</code>\n`,
      `نص الرساله :`,
      escapedMessageText,
      `رابط الرساله : ${messageLinkStr}`,
    ];

    const formattedMessage = formattedMessageLines.join('\n');

    // Build buttons row matching user screenshot: [ 📱 رسالة خاصة ] and [ 🔗 عرض الرسالة ]
    const buttons = [];

    // Direct message link button
    if (request.senderUsername) {
      buttons.push({
        text: '📱 رسالة خاصة',
        url: `https://t.me/${request.senderUsername}`
      });
    } else if (request.senderId && request.senderId !== 'unknown' && /^\d+$/.test(request.senderId)) {
      buttons.push({
        text: '📱 رسالة خاصة',
        url: `tg://user?id=${request.senderId}`
      });
    }

    // Original message link button
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
      let endOfText = normalizedText.length;
      
      // Strip metadata added by bot forwarding (prevent infinite loop)
      const groupIndex = normalizedText.indexOf('المجموعة :');
      if (groupIndex !== -1 && groupIndex > textIndex) {
        endOfText = Math.min(endOfText, groupIndex);
      }
      
      if (linkIndex !== -1 && linkIndex > textIndex) {
        endOfText = Math.min(endOfText, linkIndex);
        messageLink = normalizedText.substring(linkIndex + 'رابط الرساله :'.length).trim();
      }
      
      messageText = normalizedText.substring(textIndex + 'نص الرساله :'.length, endOfText).trim();
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

    // Check if this group is in our monitored list in memory cache (with normalized ID fallback + global fallback)
    const normGroupId = groupId.replace('-100', '');
    const monitoredGroup = monitoredGroupsCache.get(`${account.id}_${groupId}`) ||
                           monitoredGroupsCache.get(`${account.id}_${normGroupId}`) ||
                           monitoredGroupsCache.get(`${account.id}_-100${normGroupId}`) ||
                           monitoredGroupsByTgId.get(groupId) ||
                           monitoredGroupsByTgId.get(normGroupId) ||
                           monitoredGroupsByTgId.get(`-100${normGroupId}`);

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
    // Build a key from groupId + messageId if available (100% accurate for same group duplicates)
    const parsedSenderId = parsedForward ? parsedForward.senderId : (message.fromId ? String(message.fromId.userId || message.fromId.channelId || '') : '');
    const dedupKey = message.id ? `${groupId}:${message.id}` : `${parsedSenderId}:${groupId}:${messageText.substring(0, 100)}`;
    
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
    if (!isRequest || confidenceScore < 0.40) {
      if (isAdvertiser) {
        logger.info(`Msg in "${groupName}" skipped: classified as advertiser.`);
      } else {
        logger.info(`Msg in "${groupName}" skipped: not a request or confidence too low (${confidenceScore}).`);
      }
      return;
    }

    // Deduplication: avoid duplicate requests from the same sender within the last 12 hours
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    
    const senderIdentityConditions = [];
    if (senderId && senderId !== 'unknown') {
      senderIdentityConditions.push({ senderId });
    }
    if (senderPhone && senderPhone !== '') {
      senderIdentityConditions.push({ senderPhone });
    }
    if (senderUsername && senderUsername !== '') {
      senderIdentityConditions.push({ senderUsername });
    }

    let duplicateRequest = null;
    if (senderIdentityConditions.length > 0) {
      duplicateRequest = await db.request.findFirst({
        where: {
          AND: [
            { messageText },
            { capturedAt: { gte: twelveHoursAgo } },
            { OR: senderIdentityConditions },
          ],
        },
      });
    } else {
      // Fallback: if no sender identifiers, match by text in the same group
      duplicateRequest = await db.request.findFirst({
        where: {
          AND: [
            { messageText },
            { groupId },
            { capturedAt: { gte: twelveHoursAgo } },
          ],
        },
      });
    }

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
      connectionRetries: 3,
      retryDelay: 1000,
      autoReconnect: true,
      useWSS: false,
      deviceModel: 'Enjaz Platform Server',
      systemVersion: 'Linux/NodeJS',
      appVersion: '2.0.0',
    });

    await client.connect();

    if (!(await client.isUserAuthorized())) {
      logger.warn(`Account ${account.phone} is not authorized. Skipping.`);
      await client.disconnect().catch(() => {});
      return null;
    }

    logger.info(`✅ Connected Telegram account: ${account.phone}`);

    // Register message handler via queue, prevent handler stacking on reconnect
    if (!client._hasEnjazHandler) {
      client.addEventHandler(
        (event) => messageQueue.enqueue(event, account, client),
        new NewMessage({ incoming: true })
      );
      client._hasEnjazHandler = true;
    }

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
          deduplicateGroups().catch(() => {});
        } else {
          logger.info(`ℹ️ No new groups to register for ${account.phone}`);
        }
      } catch (dbErr) {
        logger.warn(`Failed to auto-register groups for ${account.phone}`, { error: dbErr.message });
      }
    })();

    return client;
  } catch (err) {
    const isAuthKeyDup = err.message?.includes('AUTH_KEY_DUPLICATED') || err.errorMessage === 'AUTH_KEY_DUPLICATED' || err.code === 406;
    if (isAuthKeyDup) {
      logger.warn(`AUTH_KEY_DUPLICATED for ${account.phone}. Session string invalidated on Telegram server.`);
    } else {
      logger.error(`Failed to create client for ${account.phone}:`, { error: err.message });
    }
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

    // 1. Warm up monitored groups cache
    await refreshMonitoredGroupsCache();

    // 2. Connect accounts sequentially with delays to avoid Telegram rate limits and AUTH_KEY_DUPLICATED
    for (const account of accounts) {
      if (activeClients.has(account.id)) {
        logger.debug(`Listener already running for account ${account.phone}`);
        continue;
      }

      try {
        const client = await createClientForAccount(account);
        if (client) {
          activeClients.set(account.id, client);
        }
      } catch (err) {
        logger.error(`Failed connecting account ${account.phone} during startup:`, { error: err.message });
      }
      await sleep(3.5);
    }

    // 3. Run group deduplication to deactivate duplicates on secondary accounts
    await deduplicateGroups();

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
        // Ping Telegram with a fast query (increased timeout to 15s to avoid false stale detections under lag)
        try {
          await Promise.race([
            client.getMe(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Ping Timeout')), 15000))
          ]);
          isHealthy = true;
        } catch (pingErr) {
          logger.warn(`Ping failed for ${accountId}: ${pingErr.message}`);
        }
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

  // Auto-recover any active DB accounts that failed startup and are missing from activeClients
  try {
    const activeDbAccounts = await db.telegramAccount.findMany({
      where: { isActive: true },
    });
    for (const acc of activeDbAccounts) {
      if (!activeClients.has(acc.id)) {
        logger.info(`SessionCheck: Account ${acc.phone} is active in DB but missing from activeClients. Attempting recovery...`);
        const client = await createClientForAccount(acc);
        if (client) {
          activeClients.set(acc.id, client);
          report.reconnected++;
          logger.info(`✅ Recovered listener for account ${acc.phone}`);
        }
      }
    }
  } catch (dbErr) {
    logger.error('SessionCheck: Error during missing accounts recovery', { error: dbErr.message });
  }

  return report;
};
module.exports = {
  startAllListeners,
  addNewListener,
  removeListener,
  checkListenersHealth,
  deduplicateGroups,
  activeClients,
  messageQueue,
};

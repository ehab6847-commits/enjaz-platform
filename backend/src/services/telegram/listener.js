'use strict';

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const { Api } = require('telegram');

const db = require('../../config/database');
const logger = require('../../config/logger');
const { classifyMessage } = require('../ai/classifier');
const { createNotification } = require('../notifications/notifier');
const { emitToRoom } = require('../../utils/socket');

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

    const usernameText = request.senderUsername ? `@${request.senderUsername}` : 'غير متوفر';
    const profileLinkText = request.profileLink ? `<a href="${request.profileLink}">رابط الملف الشخصي</a>` : 'غير متوفر';
    const messageLinkText = request.messageLink ? `<a href="${request.messageLink}">رابط الرسالة</a>` : 'غير متوفر';

    const formattedMessage = [
      `🔔 <b>طلب جديد مقتنص</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `📝 <b>الرسالة:</b>`,
      `<i>"${request.messageText}"</i>`,
      `━━━━━━━━━━━━━━━━━━`,
      `👤 <b>المُرسل:</b> ${request.senderName || 'مجهول'} (${usernameText})`,
      `👥 <b>المجموعة:</b> ${request.groupName || 'غير معروفة'}`,
      `📁 <b>نوع الخدمة:</b> ${request.serviceType || 'غير محدد'}`,
      `⚡ <b>الأولوية:</b> ${request.priority || 'NORMAL'}`,
      `🔗 <b>روابط سريعة:</b>`,
      `• ${profileLinkText}`,
      `• ${messageLinkText}`
    ].join('\n');

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: formattedMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: true
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

    const messageText = message.message.trim();
    if (!messageText || messageText.length < 5) return;

    // Get chat/group info
    const chat = await event.getChat();
    if (!chat) return;

    const groupId = String(chat.id || '');
    const groupName = chat.title || chat.username || 'Unknown Group';

    // Check if this group is in our monitored list
    const monitoredGroup = await db.monitoredGroup.findFirst({
      where: { groupId, accountId: account.id, isActive: true },
    });

    if (!monitoredGroup) return;

    // Get sender info
    const sender = await event.getSender();
    const senderName = sender
      ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Unknown'
      : 'Unknown';
    const senderUsername = sender?.username || null;
    const senderId = sender ? String(sender.id) : null;

    // Build links
    const chatUsername = chat.username;
    const profileLink = senderUsername ? `https://t.me/${senderUsername}` : null;
    const messageLink = chatUsername && message.id
      ? `https://t.me/${chatUsername}/${message.id}`
      : null;

    // Classify the message
    const classification = await classifyMessage(messageText, {
      senderName,
      groupName,
    });

    const { isRequest, isAdvertiser, serviceType, confidenceScore, keywords, priority } = classification;

    // Only save if it's a request (not spam/ads) with sufficient confidence
    if (!isRequest || confidenceScore < 0.5) {
      if (isAdvertiser) {
        logger.debug('Skipping advertiser message', { groupName, sender: senderName });
      }
      return;
    }

    // Calculate expiry (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Save to database
    const request = await db.request.create({
      data: {
        messageText,
        senderName,
        senderUsername,
        senderId,
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
      },
    });

    logger.info('New request captured', {
      requestId: request.id,
      serviceType,
      confidence: confidenceScore,
      group: groupName,
    });

    // Emit real-time event to all connected admin clients
    emitToRoom('admin', 'new_request', {
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

// ─── Health Check ──────────────────────────────────────────────────────────────
/**
 * Checks the health of all active clients and reconnects if needed.
 * @returns {Promise<Object>} Health report
 */
const checkListenersHealth = async () => {
  const report = { healthy: 0, unhealthy: 0, reconnected: 0 };

  for (const [accountId, client] of activeClients.entries()) {
    try {
      const isConnected = client.connected;
      if (!isConnected) {
        report.unhealthy++;

        // Try to reconnect
        try {
          await client.connect();
          report.reconnected++;
          logger.info(`Reconnected Telegram client`, { accountId });
        } catch (reconnectErr) {
          logger.error(`Failed to reconnect client`, { accountId, error: reconnectErr.message });
          activeClients.delete(accountId);
        }
      } else {
        report.healthy++;
      }
    } catch (err) {
      report.unhealthy++;
      logger.error('Error checking client health', { accountId, error: err.message });
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

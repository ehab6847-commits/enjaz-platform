'use strict';

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const db = require('../config/database');
const logger = require('../config/logger');
const { addNewListener, activeClients } = require('../services/telegram/listener');

// Map to hold in-memory pending client instances and their phoneCodeHash
const loginSessions = new Map();

// ─── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/telegram/accounts
 * Lists all Telegram accounts (session string masked).
 */
const listAccounts = async (req, res, next) => {
  try {
    const accounts = await db.telegramAccount.findMany({
      include: {
        _count: { select: { groups: true } },
        groups: {
          where: { isActive: true },
          select: { id: true, groupName: true, country: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Mask session strings for security
    const masked = accounts.map((a) => ({
      ...a,
      sessionString: a.sessionString ? `${a.sessionString.substring(0, 8)}...` : null,
    }));

    return res.status(200).json({ success: true, data: masked });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/telegram/accounts
 * Adds a new Telegram account with a session string.
 */
const addAccount = async (req, res, next) => {
  try {
    const { phone, sessionString } = req.body;

    const existing = await db.telegramAccount.findUnique({ where: { phone } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A Telegram account with this phone number already exists.',
      });
    }

    const account = await db.telegramAccount.create({
      data: { phone, sessionString, isActive: true },
    });

    logger.info('New Telegram account added', { accountId: account.id, phone });

    // Start listener for this account immediately
    try {
      await addNewListener(account);
    } catch (listenerErr) {
      logger.warn('Could not start listener for new account immediately', {
        accountId: account.id,
        error: listenerErr.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Telegram account added successfully.',
      data: { ...account, sessionString: undefined },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/telegram/accounts/:id
 * Deletes a Telegram account and its monitored groups.
 */
const deleteAccount = async (req, res, next) => {
  try {
    const { id } = req.params;

    const account = await db.telegramAccount.findUnique({ where: { id } });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Telegram account not found.' });
    }

    await db.telegramAccount.delete({ where: { id } });

    logger.info('Telegram account deleted', { accountId: id });

    return res.status(200).json({ success: true, message: 'Telegram account deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/telegram/accounts/:id/groups
 * Lists all monitored groups for a given account.
 */
const getAccountGroups = async (req, res, next) => {
  try {
    const { id } = req.params;

    const account = await db.telegramAccount.findUnique({
      where: { id },
      include: { groups: { orderBy: { createdAt: 'desc' } } },
    });

    if (!account) {
      return res.status(404).json({ success: false, message: 'Telegram account not found.' });
    }

    return res.status(200).json({ success: true, data: account.groups });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/telegram/accounts/:id/groups
 * Adds a monitored group to a specific account.
 */
const addGroup = async (req, res, next) => {
  try {
    const { id: accountId } = req.params;
    const { groupId, groupName, country } = req.body;

    const account = await db.telegramAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Telegram account not found.' });
    }

    const existing = await db.monitoredGroup.findUnique({
      where: { accountId_groupId: { accountId, groupId } },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This group is already being monitored by this account.',
      });
    }

    const group = await db.monitoredGroup.create({
      data: { accountId, groupId, groupName, country, isActive: true },
    });

    logger.info('Monitored group added', { accountId, groupId, groupName });

    return res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/telegram/accounts/:id/toggle
 * Toggles the active/inactive state of a Telegram account.
 */
const toggleAccount = async (req, res, next) => {
  try {
    const { id } = req.params;

    const account = await db.telegramAccount.findUnique({ where: { id } });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Telegram account not found.' });
    }

    const updated = await db.telegramAccount.update({
      where: { id },
      data: { isActive: !account.isActive },
    });

    logger.info('Telegram account toggled', { accountId: id, isActive: updated.isActive });

    return res.status(200).json({
      success: true,
      message: `Account is now ${updated.isActive ? 'active' : 'inactive'}.`,
      data: { id: updated.id, isActive: updated.isActive },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/telegram/groups
 * Lists all monitored groups across all accounts.
 */
const listAllGroups = async (req, res, next) => {
  try {
    const groups = await db.monitoredGroup.findMany({
      include: {
        account: {
          select: { id: true, phone: true, isActive: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: groups });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/telegram/groups/:id/toggle
 * Toggles a monitored group's active state.
 */
const toggleGroup = async (req, res, next) => {
  try {
    const { id } = req.params;

    const group = await db.monitoredGroup.findUnique({ where: { id } });
    if (!group) {
      return res.status(404).json({ success: false, message: 'Monitored group not found.' });
    }

    const updated = await db.monitoredGroup.update({
      where: { id },
      data: { isActive: !group.isActive },
    });

    return res.status(200).json({
      success: true,
      message: `Group is now ${updated.isActive ? 'active' : 'inactive'}.`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/telegram/groups/:id
 * Removes a monitored group.
 */
const deleteGroup = async (req, res, next) => {
  try {
    const { id } = req.params;

    const group = await db.monitoredGroup.findUnique({ where: { id } });
    if (!group) {
      return res.status(404).json({ success: false, message: 'Monitored group not found.' });
    }

    await db.monitoredGroup.delete({ where: { id } });

    return res.status(200).json({ success: true, message: 'Group removed from monitoring.' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/telegram/login/send-code
 * Sends a Telegram login verification code to the phone number.
 */
const sendLoginCode = async (req, res, next) => {
  try {
    const { phone } = req.body;
    
    logger.info('Received sendLoginCode request', { phone });

    const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
    const apiHash = process.env.TELEGRAM_API_HASH || '';

    if (!apiId || !apiHash) {
      return res.status(500).json({
        success: false,
        message: 'TELEGRAM_API_ID or TELEGRAM_API_HASH is not configured on the server.',
      });
    }

    // Disconnect old pending client if exists
    const oldSession = loginSessions.get(phone);
    if (oldSession && oldSession.client) {
      try {
        await oldSession.client.disconnect();
      } catch (e) {
        // ignore
      }
      loginSessions.delete(phone);
    }

    // Initialize temporary client
    const session = new StringSession('');
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });

    await client.connect();

    // Call sendCode
    const { phoneCodeHash } = await client.sendCode(
      {
        apiId,
        apiHash,
      },
      phone
    );

    // Save in map
    loginSessions.set(phone, {
      client,
      phoneCodeHash,
      createdAt: Date.now(),
    });

    logger.info(`Telegram login code sent for ${phone}`);
    return res.status(200).json({
      success: true,
      message: 'Verification code sent successfully.',
    });
  } catch (err) {
    logger.error('Failed to send Telegram login code', { error: err.message });
    return res.status(400).json({
      success: false,
      message: `Failed to send code: ${err.message}`,
    });
  }
};

/**
 * POST /api/telegram/login/verify-code
 * Verifies the login code, saves the account session, and starts the listener.
 */
const verifyLoginCode = async (req, res, next) => {
  try {
    const { phone, code, password } = req.body;

    logger.info('Received verifyLoginCode request', { phone, hasPassword: !!password });

    const sessionData = loginSessions.get(phone);
    if (!sessionData) {
      return res.status(400).json({
        success: false,
        message: 'Login session expired or not found. Please request verification code again.',
      });
    }

    const { client, phoneCodeHash } = sessionData;

    let user;
    try {
      // Sign in using the low-level Api.auth.SignIn call to avoid sendCode restarting the auth flow
      const result = await client.invoke(new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash,
        phoneCode: code,
      }));
      
      if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        return res.status(400).json({
          success: false,
          message: 'هذا الرقم غير مسجل في تيليجرام. التسجيل من خلال البوت غير مدعوم حالياً.',
        });
      }
      user = result.user;
    } catch (signInErr) {
      if (signInErr.message.includes('SESSION_PASSWORD_NEEDED') || signInErr.name === 'SessionPasswordNeededError') {
        if (!password) {
          return res.status(200).json({
            success: false,
            requiresPassword: true,
            message: '2FA Password is required for this account.',
          });
        }
        // If password was provided, proceed to sign in with password
        const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
        const apiHash = process.env.TELEGRAM_API_HASH || '';
        user = await client.signInWithPassword(
          { apiId, apiHash },
          {
            password: () => Promise.resolve(password),
            onError: (err) => {
              throw err;
            }
          }
        );
      } else {
        throw signInErr;
      }
    }

    // Successful sign in! Let's get user info
    const me = user || await client.getMe();
    const username = me.username || '';
    const firstName = me.firstName || '';
    const lastName = me.lastName || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Telegram User';

    const sessionString = client.session.save();

    // Save/upsert to DB
    const account = await db.telegramAccount.upsert({
      where: { phone },
      create: {
        phone,
        sessionString,
        isActive: true,
        lastSeen: new Date(),
      },
      update: {
        sessionString,
        isActive: true,
        lastSeen: new Date(),
      },
    });

    logger.info('Telegram account authorized and saved', { phone, fullName, username });

    // Clean up temporary session
    loginSessions.delete(phone);

    // Start background listener for this account
    try {
      await addNewListener(account);
    } catch (listenerErr) {
      logger.warn('Could not start listener for new account immediately', {
        accountId: account.id,
        error: listenerErr.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Logged in and account registered successfully.',
      data: {
        id: account.id,
        phone: account.phone,
        fullName,
        username,
      },
    });
  } catch (err) {
    logger.error('Failed to verify Telegram login code', { error: err.message });
    return res.status(400).json({
      success: false,
      message: `Verification failed: ${err.message}`,
    });
  }
};

/**
 * GET /api/telegram/debug-status
 * Returns health report, active listener clients, env variable status, and recent log contents.
 */
const getDebugStatus = async (req, res, next) => {
  const fs = require('fs');
  const path = require('path');
  try {
    const activePhones = [];
    const accounts = await db.telegramAccount.findMany({
      where: { isActive: true },
    });
    for (const [id, client] of activeClients.entries()) {
      const acc = accounts.find((a) => a.id === id);
      activePhones.push({
        id,
        phone: acc ? acc.phone : 'unknown',
        connected: client.connected,
      });
    }

    // Read last 100 lines of combined log
    let combinedLogs = '';
    try {
      const logPath = path.join(__dirname, '../../logs/combined.log');
      if (fs.existsSync(logPath)) {
        const fileContent = fs.readFileSync(logPath, 'utf8');
        combinedLogs = fileContent.split('\n').slice(-100).join('\n');
      } else {
        combinedLogs = 'combined.log file does not exist';
      }
    } catch (logErr) {
      combinedLogs = 'Error reading combined.log: ' + logErr.message;
    }

    // Read last 100 lines of error log
    let errorLogs = '';
    try {
      const errLogPath = path.join(__dirname, '../../logs/error.log');
      if (fs.existsSync(errLogPath)) {
        const fileContent = fs.readFileSync(errLogPath, 'utf8');
        errorLogs = fileContent.split('\n').slice(-100).join('\n');
      } else {
        errorLogs = 'error.log file does not exist';
      }
    } catch (logErr) {
      errorLogs = 'Error reading error.log: ' + logErr.message;
    }

    // Check env variables
    const envCheck = {
      OPENAI_API_KEY_EXISTS: !!process.env.OPENAI_API_KEY,
      OPENAI_API_KEY_IS_PLACEHOLDER: process.env.OPENAI_API_KEY === 'sk-placeholder',
      TELEGRAM_API_ID_EXISTS: !!process.env.TELEGRAM_API_ID,
      TELEGRAM_API_HASH_EXISTS: !!process.env.TELEGRAM_API_HASH,
      TELEGRAM_BOT_TOKEN_EXISTS: !!process.env.TELEGRAM_BOT_TOKEN,
      FORWARD_CHANNEL_ID_EXISTS: !!process.env.FORWARD_CHANNEL_ID,
    };

    const monitoredGroupsCount = await db.monitoredGroup.count();
    const activeGroupsCount = await db.monitoredGroup.count({ where: { isActive: true } });
    const requestsCount = await db.request.count();

    return res.status(200).json({
      success: true,
      activeListenersCount: activeClients.size,
      activeListeners: activePhones,
      monitoredGroupsCount,
      activeGroupsCount,
      requestsCount,
      envCheck,
      combinedLogs,
      errorLogs,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listAccounts,
  addAccount,
  deleteAccount,
  getAccountGroups,
  addGroup,
  toggleAccount,
  listAllGroups,
  toggleGroup,
  deleteGroup,
  sendLoginCode,
  verifyLoginCode,
  getDebugStatus,
};

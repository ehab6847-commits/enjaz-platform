'use strict';

const db = require('../config/database');
const logger = require('../config/logger');
const { addNewListener } = require('../services/telegram/listener');

// ─── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/telegram/accounts
 * Lists all Telegram accounts (session string masked).
 */
const listAccounts = async (req, res, next) => {
  try {
    const accounts = await db.telegramAccount.findMany({
      include: {
        _count: { select: { monitoredGroups: true } },
        monitoredGroups: {
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
      include: { monitoredGroups: { orderBy: { createdAt: 'desc' } } },
    });

    if (!account) {
      return res.status(404).json({ success: false, message: 'Telegram account not found.' });
    }

    return res.status(200).json({ success: true, data: account.monitoredGroups });
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
};

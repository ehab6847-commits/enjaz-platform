'use strict';

const db = require('../config/database');
const logger = require('../config/logger');
const { createNotification } = require('../services/notifications/notifier');

// ─── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/users
 * Lists all users with pagination and filters.
 */
const listUsers = async (req, res, next) => {
  try {
    const { status, role, search, page, limit } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          status: true,
          twoFactorEnabled: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.user.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/:id
 * Returns a single user by ID.
 */
const getUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { notifications: true, activityLogs: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/users/:id
 * Updates a user's details (admin only).
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, email, status, role } = req.body;

    // Prevent admin from modifying their own role
    if (id === req.user.id && role && role !== req.user.role) {
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own role.',
      });
    }

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Check for username/email conflicts
    if (username || email) {
      const conflict = await db.user.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            { OR: [...(username ? [{ username }] : []), ...(email ? [{ email }] : [])] },
          ],
        },
      });
      if (conflict) {
        return res.status(409).json({ success: false, message: 'Username or email already in use.' });
      }
    }

    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (status) updateData.status = status;
    if (role) updateData.role = role;

    const updated = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    logger.info('User updated by admin', { targetUserId: id, by: req.user.id, changes: updateData });

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/users/:id/approve
 * Approves a PENDING user, setting status to ACTIVE.
 */
const approveUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve a user with status: ${user.status}`,
      });
    }

    await db.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });

    // Notify the user
    await createNotification({
      userId: id,
      type: 'ACCOUNT_APPROVED',
      message: 'Your account has been approved. You can now log in.',
      requestId: null,
    });

    logger.info('User approved', { targetUserId: id, by: req.user.id });

    return res.status(200).json({ success: true, message: 'User account approved successfully.' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/users/:id/reject
 * Blocks/rejects a user account.
 */
const rejectUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot block your own account.' });
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    await db.user.update({
      where: { id },
      data: { status: 'BLOCKED' },
    });

    await createNotification({
      userId: id,
      type: 'ACCOUNT_REJECTED',
      message: reason
        ? `Your account has been rejected. Reason: ${reason}`
        : 'Your account application has been rejected.',
      requestId: null,
    });

    logger.info('User rejected/blocked', { targetUserId: id, by: req.user.id, reason });

    return res.status(200).json({ success: true, message: 'User account has been blocked/rejected.' });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/users/:id
 * Permanently deletes a user account.
 */
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    await db.user.delete({ where: { id } });

    logger.info('User deleted', { targetUserId: id, by: req.user.id });

    return res.status(200).json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listUsers,
  getUser,
  updateUser,
  approveUser,
  rejectUser,
  deleteUser,
};

'use strict';

const db = require('../config/database');

// ─── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/notifications
 * Returns paginated notifications for the authenticated user.
 */
const listNotifications = async (req, res, next) => {
  try {
    const { isRead, page, limit } = req.query;
    const skip = (page - 1) * limit;

    const where = { userId: req.user.id };
    if (typeof isRead === 'boolean') where.isRead = isRead;

    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          request: {
            select: { id: true, messageText: true, status: true, senderName: true },
          },
        },
      }),
      db.notification.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: notifications,
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
 * GET /api/notifications/unread-count
 * Returns the count of unread notifications for the user.
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const count = await db.notification.count({
      where: { userId: req.user.id, isRead: false },
    });

    return res.status(200).json({ success: true, count });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/notifications/:id/read
 * Marks a specific notification as read.
 */
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await db.notification.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    const updated = await db.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/notifications/read-all
 * Marks all of the user's notifications as read.
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const { count } = await db.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });

    return res.status(200).json({
      success: true,
      message: `${count} notification(s) marked as read.`,
      updated: count,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/notifications/:id
 * Deletes a notification (only if it belongs to the current user).
 */
const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await db.notification.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    await db.notification.delete({ where: { id } });

    return res.status(200).json({ success: true, message: 'Notification deleted.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};

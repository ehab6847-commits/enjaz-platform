'use strict';

const db = require('../../config/database');
const logger = require('../../config/logger');
const { emitToRoom } = require('../../utils/socket');

// ─── Telegram Bot Sender (optional) ──────────────────────────────────────────
/**
 * Sends a message to the admin via Telegram bot API (if bot token configured).
 * This is a lightweight HTTP call, not using gramJS.
 *
 * @param {string} message - Message to send
 */
const sendTelegramAdminMessage = async (message) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = process.env.ADMIN_TELEGRAM_ID;

  if (!botToken || !adminId) return;

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const fetch = (await import('node-fetch')).default;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    logger.warn('Failed to send Telegram admin message', { error: err.message });
  }
};

// ─── Main Notifier ─────────────────────────────────────────────────────────────
/**
 * Creates a notification in the database, emits it via Socket.io,
 * and optionally sends a Telegram message to the admin.
 *
 * @param {Object} options
 * @param {string} options.userId - Target user ID
 * @param {string|null} options.requestId - Related request ID (optional)
 * @param {string} options.type - Notification type (e.g., 'NEW_REQUEST')
 * @param {string} options.message - Human-readable notification message
 * @returns {Promise<import('@prisma/client').Notification>}
 */
const createNotification = async ({ userId, requestId = null, type, message }) => {
  try {
    // Create in database
    const notification = await db.notification.create({
      data: {
        userId,
        requestId,
        type,
        message,
        isRead: false,
      },
      include: {
        request: {
          select: { id: true, messageText: true, status: true },
        },
      },
    });

    // Emit to user's personal room
    emitToRoom(`user:${userId}`, 'notification', notification);

    // If it's a NEW_REQUEST, also emit to admin room
    if (type === 'NEW_REQUEST') {
      emitToRoom('admin', 'notification', notification);

      // Send Telegram message to admin
      await sendTelegramAdminMessage(
        `🔔 <b>طلب جديد</b>\n\n${message}`
      );
    }

    return notification;
  } catch (err) {
    logger.error('Failed to create notification', { error: err.message, userId, type });
    throw err;
  }
};

/**
 * Marks all notifications of a type as read for a user.
 * @param {string} userId
 * @param {string} type
 */
const markTypeAsRead = async (userId, type) => {
  try {
    await db.notification.updateMany({
      where: { userId, type, isRead: false },
      data: { isRead: true },
    });
  } catch (err) {
    logger.error('Failed to mark notifications as read', { error: err.message });
  }
};

/**
 * Broadcasts a notification to all active admin users.
 * @param {string} type
 * @param {string} message
 * @param {string|null} requestId
 */
const notifyAllAdmins = async (type, message, requestId = null) => {
  try {
    const admins = await db.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });

    await Promise.allSettled(
      admins.map((admin) =>
        createNotification({ userId: admin.id, requestId, type, message })
      )
    );
  } catch (err) {
    logger.error('Failed to notify all admins', { error: err.message });
  }
};

module.exports = { createNotification, markTypeAsRead, notifyAllAdmins };

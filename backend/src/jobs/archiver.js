'use strict';

const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../config/logger');
const { checkListenersHealth } = require('../services/telegram/listener');

// ─── Archive Old Requests ──────────────────────────────────────────────────────
/**
 * Archives NEW/VIEWED requests older than 48 hours (2 days).
 * Runs every 6 hours.
 */
const archiveOldRequests = async () => {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours (2 days)

    const { count } = await db.request.updateMany({
      where: {
        status: { in: ['NEW', 'VIEWED'] },
        capturedAt: { lt: cutoff },
      },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });

    if (count > 0) {
      logger.info(`[Archiver] Archived ${count} old request(s)`);
    }
  } catch (err) {
    logger.error('[Archiver] Failed to archive old requests', { error: err.message });
  }
};

// ─── Delete Old Archives ───────────────────────────────────────────────────────
/**
 * Deletes ARCHIVED requests older than 2 days to free storage.
 * Runs every 6 hours.
 */
const deleteOldArchives = async () => {
  try {
    // Delete archived requests that are older than 2 days
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const { count } = await db.request.deleteMany({
      where: {
        status: 'ARCHIVED',
        archivedAt: { lt: cutoff },
      },
    });

    if (count > 0) {
      logger.info(`[Archiver] Deleted ${count} archived request(s) to free storage`);
    }

    // Also delete related notifications for cleaned requests
    const notifCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const { count: notifCount } = await db.notification.deleteMany({
      where: {
        createdAt: { lt: notifCutoff },
        isRead: true,
      },
    });
    if (notifCount > 0) {
      logger.info(`[Archiver] Deleted ${notifCount} old read notification(s)`);
    }


  } catch (err) {
    logger.error('[Archiver] Failed to delete old archives', { error: err.message });
  }
};

// ─── Check Telegram Session Health ────────────────────────────────────────────
/**
 * Checks health of Telegram listener sessions and reconnects if needed.
 * Runs every 5 minutes.
 */
const checkTelegramSessions = async () => {
  try {
    const report = await checkListenersHealth();
    if (report.unhealthy > 0) {
      logger.warn('[SessionCheck] Unhealthy Telegram sessions detected', report);
    } else if (report.healthy > 0) {
      logger.debug(`[SessionCheck] All ${report.healthy} session(s) healthy`);
    }
  } catch (err) {
    logger.error('[SessionCheck] Failed to check Telegram sessions', { error: err.message });
  }
};

// ─── Clean Old Activity Logs ──────────────────────────────────────────────────
/**
 * Deletes activity logs older than 30 days.
 * Runs daily at 3:00 AM.
 */
const cleanOldActivityLogs = async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { count } = await db.activityLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (count > 0) {
      logger.info(`[Cleanup] Deleted ${count} old activity log(s)`);
    }
  } catch (err) {
    logger.error('[Cleanup] Failed to clean old activity logs', { error: err.message });
  }
};

// ─── Clean Old Notifications ──────────────────────────────────────────────────
/**
 * Deletes read notifications older than 14 days.
 * Runs daily at 3:30 AM.
 */
const cleanOldNotifications = async () => {
  try {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const { count } = await db.notification.deleteMany({
      where: {
        isRead: true,
        createdAt: { lt: cutoff },
      },
    });

    if (count > 0) {
      logger.info(`[Cleanup] Deleted ${count} old read notification(s)`);
    }
  } catch (err) {
    logger.error('[Cleanup] Failed to clean old notifications', { error: err.message });
  }
};

// ─── Initialize Cron Jobs ──────────────────────────────────────────────────────
/**
 * Registers all cron jobs. Call once on server startup.
 */
const initCronJobs = () => {
  // Archive requests older than 48h — every 6 hours
  cron.schedule('0 */6 * * *', archiveOldRequests, {
    name: 'archive-old-requests',
    timezone: 'Asia/Riyadh',
  });

  // Delete archives older than 2 days — every 6 hours
  cron.schedule('30 */6 * * *', deleteOldArchives, {
    name: 'delete-old-archives',
    timezone: 'Asia/Riyadh',
  });

  // Check Telegram session health — every 5 minutes
  cron.schedule('*/5 * * * *', checkTelegramSessions, {
    name: 'check-telegram-sessions',
    timezone: 'Asia/Riyadh',
  });

  // Clean old activity logs — daily at 3:00 AM
  cron.schedule('0 3 * * *', cleanOldActivityLogs, {
    name: 'clean-activity-logs',
    timezone: 'Asia/Riyadh',
  });

  // Clean old notifications — daily at 3:30 AM
  cron.schedule('30 3 * * *', cleanOldNotifications, {
    name: 'clean-old-notifications',
    timezone: 'Asia/Riyadh',
  });

  logger.info('Cron jobs scheduled:', [
    'archive-old-requests (every 6 hours)',
    'delete-old-archives (every 6 hours)',
    'check-telegram-sessions (every 5 min)',
    'clean-activity-logs (daily 3:00 AM)',
    'clean-old-notifications (daily 3:30 AM)',
  ]);
};

module.exports = {
  initCronJobs,
  archiveOldRequests,
  deleteOldArchives,
  checkTelegramSessions,
  cleanOldActivityLogs,
  cleanOldNotifications,
};

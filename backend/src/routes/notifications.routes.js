'use strict';

const express = require('express');
const router = express.Router();
const { z } = require('zod');

const notificationsController = require('../controllers/notifications.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ─── Routes ────────────────────────────────────────────────────────────────────

router.use(authenticate);

/**
 * @route  GET /api/notifications
 * @desc   Get all notifications for the current user
 * @access Private
 */
router.get(
  '/',
  validate({
    query: z.object({
      isRead: z.coerce.boolean().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
  }),
  notificationsController.listNotifications
);

/**
 * @route  GET /api/notifications/unread-count
 * @desc   Get the count of unread notifications
 * @access Private
 */
router.get('/unread-count', notificationsController.getUnreadCount);

/**
 * @route  POST /api/notifications/:id/read
 * @desc   Mark a single notification as read
 * @access Private
 */
router.post('/:id/read', notificationsController.markAsRead);

/**
 * @route  POST /api/notifications/read-all
 * @desc   Mark all notifications as read
 * @access Private
 */
router.post('/read-all', notificationsController.markAllAsRead);

/**
 * @route  DELETE /api/notifications/:id
 * @desc   Delete a single notification
 * @access Private
 */
router.delete('/:id', notificationsController.deleteNotification);

module.exports = router;

'use strict';

const express = require('express');
const router = express.Router();
const { z } = require('zod');

const telegramController = require('../controllers/telegram.controller');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ─── Validation Schemas ────────────────────────────────────────────────────────
const addAccountSchema = z.object({
  phone: z
    .string()
    .min(7, 'Phone number is too short')
    .max(20, 'Phone number is too long')
    .regex(/^\+?[0-9]+$/, 'Invalid phone number format'),
  sessionString: z.string().min(10, 'Session string is required'),
});

const sendCodeSchema = z.object({
  phone: z
    .string()
    .min(7, 'Phone number is too short')
    .max(20, 'Phone number is too long')
    .regex(/^\+?[0-9]+$/, 'Invalid phone number format'),
});

const verifyCodeSchema = z.object({
  phone: z
    .string()
    .min(7, 'Phone number is too short')
    .max(20, 'Phone number is too long')
    .regex(/^\+?[0-9]+$/, 'Invalid phone number format'),
  code: z.string().min(1, 'Verification code is required'),
  password: z.string().optional(),
});

const addGroupSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  groupName: z.string().min(1, 'Group name is required'),
  country: z.string().optional(),
});

// ─── Routes ────────────────────────────────────────────────────────────────────

// All telegram routes require authentication
router.use(authenticate);

/**
 * @route  GET /api/telegram/accounts
 * @desc   List all Telegram accounts
 * @access Admin
 */
router.get('/accounts', requireAdmin, telegramController.listAccounts);

/**
 * @route  GET /api/telegram/debug-status
 * @desc   Get listeners debug status and logs
 * @access Admin
 */
router.get('/debug-status', requireAdmin, telegramController.getDebugStatus);

/**
 * @route  POST /api/telegram/login/send-code
 * @desc   Send login verification code
 * @access Admin
 */
router.post('/login/send-code', requireAdmin, validate({ body: sendCodeSchema }), telegramController.sendLoginCode);

/**
 * @route  POST /api/telegram/login/verify-code
 * @desc   Verify login code and save account
 * @access Admin
 */
router.post('/login/verify-code', requireAdmin, validate({ body: verifyCodeSchema }), telegramController.verifyLoginCode);

/**
 * @route  POST /api/telegram/accounts
 * @desc   Add a new Telegram account with session string
 * @access Admin
 */
router.post('/accounts', requireAdmin, validate({ body: addAccountSchema }), telegramController.addAccount);

/**
 * @route  DELETE /api/telegram/accounts/:id
 * @desc   Remove a Telegram account
 * @access Admin
 */
router.delete('/accounts/:id', requireAdmin, telegramController.deleteAccount);

/**
 * @route  GET /api/telegram/accounts/:id/groups
 * @desc   List monitored groups for a specific account
 * @access Admin
 */
router.get('/accounts/:id/groups', requireAdmin, telegramController.getAccountGroups);

/**
 * @route  POST /api/telegram/accounts/:id/groups
 * @desc   Add a monitored group to an account
 * @access Admin
 */
router.post('/accounts/:id/groups', requireAdmin, validate({ body: addGroupSchema }), telegramController.addGroup);

/**
 * @route  POST /api/telegram/accounts/:id/toggle
 * @desc   Toggle account active/inactive status
 * @access Admin
 */
router.post('/accounts/:id/toggle', requireAdmin, telegramController.toggleAccount);

/**
 * @route  GET /api/telegram/groups
 * @desc   List all monitored groups across all accounts
 * @access Private
 */
router.get('/groups', telegramController.listAllGroups);

/**
 * @route  PUT /api/telegram/groups/:id/toggle
 * @desc   Toggle a monitored group active/inactive
 * @access Admin
 */
router.put('/groups/:id/toggle', requireAdmin, telegramController.toggleGroup);

/**
 * @route  DELETE /api/telegram/groups/:id
 * @desc   Remove a monitored group
 * @access Admin
 */
router.delete('/groups/:id', requireAdmin, telegramController.deleteGroup);

module.exports = router;

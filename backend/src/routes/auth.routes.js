'use strict';

const express = require('express');
const router = express.Router();
const { z } = require('zod');

const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authLimiter, registerLimiter } = require('../middleware/rateLimiter');

// ─── Validation Schemas ────────────────────────────────────────────────────────
const loginSchema = z.object({
  username: z.string().min(3, 'Username or email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

const verify2faSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  token: z.string().length(6, '2FA token must be 6 digits').regex(/^\d+$/, 'Token must be numeric'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ─── Routes ────────────────────────────────────────────────────────────────────

/**
 * @route  POST /api/auth/login
 * @desc   Authenticate user and return JWT tokens (or prompt 2FA)
 * @access Public
 */
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);

/**
 * @route  POST /api/auth/register
 * @desc   Register a new specialist account (requires admin approval)
 * @access Public
 */
router.post('/register', registerLimiter, validate({ body: registerSchema }), authController.register);

/**
 * @route  POST /api/auth/verify-2fa
 * @desc   Verify TOTP code after login
 * @access Public
 */
router.post('/verify-2fa', authLimiter, validate({ body: verify2faSchema }), authController.verify2fa);

/**
 * @route  POST /api/auth/refresh
 * @desc   Issue a new access token using a refresh token
 * @access Public
 */
router.post('/refresh', validate({ body: refreshSchema }), authController.refresh);

/**
 * @route  POST /api/auth/logout
 * @desc   Logout the current user
 * @access Private
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route  GET /api/auth/me
 * @desc   Get the currently authenticated user's profile
 * @access Private
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @route  POST /api/auth/setup-2fa
 * @desc   Generate a TOTP secret and QR code for 2FA setup
 * @access Private
 */
router.post('/setup-2fa', authenticate, authController.setup2fa);

/**
 * @route  POST /api/auth/enable-2fa
 * @desc   Enable 2FA after verifying the first TOTP code
 * @access Private
 */
router.post(
  '/enable-2fa',
  authenticate,
  validate({
    body: z.object({
      token: z.string().length(6).regex(/^\d+$/),
    }),
  }),
  authController.enable2fa
);

/**
 * @route  POST /api/auth/disable-2fa
 * @desc   Disable 2FA (requires current TOTP code)
 * @access Private
 */
router.post(
  '/disable-2fa',
  authenticate,
  validate({
    body: z.object({
      token: z.string().length(6).regex(/^\d+$/),
    }),
  }),
  authController.disable2fa
);

module.exports = router;

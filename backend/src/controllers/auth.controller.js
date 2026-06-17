'use strict';

const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const db = require('../config/database');
const logger = require('../config/logger');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwt');
const { createNotification } = require('../services/notifications/notifier');

const SALT_ROUNDS = 12;

// ─── In-memory refresh token store (use Redis in production) ──────────────────
// Maps userId -> Set of valid refresh tokens
const refreshTokenStore = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Logs an activity for audit trail.
 * @param {string} userId
 * @param {string} action
 * @param {Object} details
 * @param {string|null} ip
 */
const logActivity = async (userId, action, details = {}, ip = null) => {
  try {
    await db.activityLog.create({
      data: { userId, action, details, ipAddress: ip },
    });
  } catch (err) {
    logger.error('Failed to log activity', { error: err.message });
  }
};

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Validates credentials. If 2FA enabled, returns a partial token prompt.
 * Otherwise, returns full JWT tokens.
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await db.user.findFirst({
      where: {
        OR: [
          { email: username },
          { username: username },
        ],
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
    }

    if (user.status === 'BLOCKED') {
      return res.status(403).json({ success: false, message: 'Account has been blocked.' });
    }

    if (user.status === 'PENDING') {
      return res.status(403).json({
        success: false,
        message: 'Account is pending approval by an administrator.',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await logActivity(user.id, 'LOGIN_FAILED', { username }, req.ip);
      return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
    }

    // If 2FA is enabled, require TOTP before issuing full tokens
    if (user.twoFactorEnabled) {
      // Issue a short-lived pre-auth token
      const preAuthToken = generateAccessToken({ userId: user.id, preAuth: true });
      return res.status(200).json({
        success: true,
        requiresTwoFactor: true,
        userId: user.id,
        preAuthToken,
      });
    }

    // Issue full tokens
    const tokenPayload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ userId: user.id });

    // Store refresh token
    if (!refreshTokenStore.has(user.id)) {
      refreshTokenStore.set(user.id, new Set());
    }
    refreshTokenStore.get(user.id).add(refreshToken);

    await logActivity(user.id, 'LOGIN_SUCCESS', {}, req.ip);

    return res.status(200).json({
      success: true,
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/register
 * Creates a new user with PENDING status. Admin is notified.
 */
const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Check for duplicates
    const existing = await db.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      const field = existing.email === email ? 'email' : 'username';
      return res.status(409).json({
        success: false,
        message: `An account with this ${field} already exists.`,
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await db.user.create({
      data: {
        username,
        email,
        passwordHash,
        role: 'SPECIALIST',
        status: 'PENDING',
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    // Notify all admins
    const admins = await db.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });

    await Promise.allSettled(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          type: 'NEW_REGISTRATION',
          message: `New specialist registration: ${username} (${email}) is pending approval.`,
          requestId: null,
        })
      )
    );

    logger.info('New user registered', { userId: user.id, username, email });

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Your account is pending approval by an administrator.',
      user,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/verify-2fa
 * Validates TOTP code and issues full JWT tokens.
 */
const verify2fa = async (req, res, next) => {
  try {
    const { userId, token } = req.body;

    const user = await db.user.findUnique({ where: { id: userId } });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: 'Two-factor authentication is not enabled for this account.' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, message: 'Account is not active.' });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1, // Allow 30s clock drift
    });

    if (!isValid) {
      await logActivity(userId, '2FA_FAILED', {}, req.ip);
      return res.status(401).json({ success: false, message: 'Invalid or expired 2FA code.' });
    }

    const tokenPayload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ userId: user.id });

    if (!refreshTokenStore.has(user.id)) {
      refreshTokenStore.set(user.id, new Set());
    }
    refreshTokenStore.get(user.id).add(refreshToken);

    await logActivity(userId, '2FA_SUCCESS', {}, req.ip);

    return res.status(200).json({
      success: true,
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/refresh
 * Issues a new access token if the refresh token is valid.
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    let decoded;
    try {
      decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
    }

    const userId = decoded.userId;

    // Check if refresh token is in our store
    const userTokens = refreshTokenStore.get(userId);
    if (!userTokens || !userTokens.has(refreshToken)) {
      return res.status(401).json({ success: false, message: 'Refresh token has been revoked.' });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ success: false, message: 'User not found or inactive.' });
    }

    const newAccessToken = generateAccessToken({ userId: user.id, role: user.role });

    return res.status(200).json({
      success: true,
      token: newAccessToken,
      accessToken: newAccessToken,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/logout
 * Revokes the provided refresh token.
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const userId = req.user.id;

    if (refreshToken && refreshTokenStore.has(userId)) {
      refreshTokenStore.get(userId).delete(refreshToken);
    }

    await logActivity(userId, 'LOGOUT', {}, req.ip);

    return res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 * Returns the current authenticated user's profile.
 */
const getMe = async (req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
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
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/setup-2fa
 * Generates a TOTP secret and returns QR code for the authenticator app.
 */
const setup2fa = async (req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, email: true, twoFactorEnabled: true },
    });

    if (user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: '2FA is already enabled.' });
    }

    const secret = speakeasy.generateSecret({
      name: `Enjaz Platform (${user.email})`,
      length: 32,
    });

    // Store the secret temporarily (will be confirmed via enable-2fa)
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret.base32 },
    });

    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    return res.status(200).json({
      success: true,
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCode: qrCodeDataUrl,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/enable-2fa
 * Verifies the TOTP token and marks 2FA as enabled.
 */
const enable2fa = async (req, res, next) => {
  try {
    const { token } = req.body;

    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: 'Please run setup-2fa first.' });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: '2FA is already enabled.' });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid TOTP code. Please try again.' });
    }

    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });

    await logActivity(user.id, '2FA_ENABLED', {}, req.ip);

    return res.status(200).json({ success: true, message: 'Two-factor authentication has been enabled.' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/disable-2fa
 * Disables 2FA after verifying the current TOTP code.
 */
const disable2fa = async (req, res, next) => {
  try {
    const { token } = req.body;

    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: '2FA is not enabled.' });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid TOTP code.' });
    }

    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    await logActivity(user.id, '2FA_DISABLED', {}, req.ip);

    return res.status(200).json({ success: true, message: 'Two-factor authentication has been disabled.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login,
  register,
  verify2fa,
  refresh,
  logout,
  getMe,
  setup2fa,
  enable2fa,
  disable2fa,
};

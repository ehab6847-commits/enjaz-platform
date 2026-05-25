'use strict';

const { verifyToken } = require('../utils/jwt');
const db = require('../config/database');
const logger = require('../config/logger');

/**
 * Extracts and verifies JWT from Authorization header.
 * Attaches decoded user payload to req.user.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = verifyToken(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired. Please refresh.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
        code: 'INVALID_TOKEN',
      });
    }

    // Fetch fresh user from DB to check status
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        twoFactorEnabled: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (user.status === 'BLOCKED') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact support.',
        code: 'ACCOUNT_BLOCKED',
      });
    }

    if (user.status === 'PENDING') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending approval.',
        code: 'ACCOUNT_PENDING',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error('Authentication middleware error', { error: err.message });
    next(err);
  }
};

/**
 * Middleware factory that checks for ADMIN role.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.',
    });
  }
  next();
};

/**
 * Middleware that allows ADMIN or SPECIALIST roles.
 */
const requireSpecialist = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  if (!['ADMIN', 'SPECIALIST'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Specialist role required.',
    });
  }
  next();
};

/**
 * Middleware factory that allows specific roles.
 * @param {...string} roles - allowed roles e.g. 'ADMIN', 'SPECIALIST'
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${roles.join(', ')}.`,
      });
    }
    next();
  };
};

module.exports = { authenticate, requireAdmin, requireSpecialist, requireRole };

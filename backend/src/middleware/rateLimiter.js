'use strict';

const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// ─── Custom Handler ────────────────────────────────────────────────────────────
const rateLimitHandler = (req, res, next) => {
  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    url: req.originalUrl,
    method: req.method,
  });
  res.status(429).json({
    success: false,
    message: 'Too many requests, please try again later.',
  });
};

// ─── General API Limiter ───────────────────────────────────────────────────────
/**
 * General rate limiter for all /api/ routes.
 * 100 requests per 15 minutes per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes.',
  handler: rateLimitHandler,
});

// ─── Auth Limiter ──────────────────────────────────────────────────────────────
/**
 * Strict rate limiter for authentication routes.
 * 10 requests per 15 minutes per IP to prevent brute force.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
  handler: rateLimitHandler,
  skipSuccessfulRequests: true, // Only count failed requests
});

// ─── Register Limiter ──────────────────────────────────────────────────────────
/**
 * Very strict limiter for registration endpoint.
 * 3 requests per hour per IP.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many registration attempts. Please try again in an hour.',
  handler: rateLimitHandler,
});

module.exports = { apiLimiter, authLimiter, registerLimiter };

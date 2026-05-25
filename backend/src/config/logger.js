'use strict';

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// ─── Log Directory ─────────────────────────────────────────────────────────────
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ─── Custom Format ─────────────────────────────────────────────────────────────
const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${ts} [${level}]: ${stack || message}${metaStr}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

// ─── Transports ────────────────────────────────────────────────────────────────
const transports = [
  // Console - always on
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
    silent: process.env.NODE_ENV === 'test',
  }),

  // Combined log file (all levels)
  new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    format: prodFormat,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 7,
    tailable: true,
  }),

  // Error log file (error level only)
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: prodFormat,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 14,
    tailable: true,
  }),
];

// ─── Logger Instance ───────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  levels: winston.config.npm.levels,
  transports,
  exitOnError: false,
});

module.exports = logger;

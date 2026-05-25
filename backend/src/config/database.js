'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

// ─── Prisma Singleton ──────────────────────────────────────────────────────────
let prisma;

/**
 * Returns the singleton PrismaClient instance.
 * Reuses the existing instance to prevent connection pool exhaustion.
 * @returns {PrismaClient}
 */
function getDatabase() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      prisma.$on('query', (e) => {
        if (e.duration > 200) {
          logger.warn('Slow Prisma query detected', {
            query: e.query,
            duration: `${e.duration}ms`,
          });
        }
      });
    }

    prisma.$on('error', (e) => {
      logger.error('Prisma error', { message: e.message });
    });
  }
  return prisma;
}

const db = getDatabase();

module.exports = db;

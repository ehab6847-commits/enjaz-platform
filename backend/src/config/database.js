'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

// ─── Prisma Singleton ──────────────────────────────────────────────────────────
let prisma;
let isConnected = false;

/**
 * Returns the singleton PrismaClient instance.
 * Reuses the existing instance to prevent connection pool exhaustion.
 * @returns {PrismaClient}
 */
function getDatabase() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    prisma.$on('error', (e) => {
      logger.error('Prisma error', { message: e.message });
      isConnected = false;
    });

    prisma.$on('warn', (e) => {
      logger.warn('Prisma warning', { message: e.message });
    });
  }
  return prisma;
}

/**
 * Tests the database connection.
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const db = getDatabase();
    await db.$queryRawUnsafe('SELECT 1');
    isConnected = true;
    logger.info('✅ Database connection established');
    return true;
  } catch (err) {
    isConnected = false;
    logger.warn('⚠️ Database connection failed', { error: err.message ? err.message.substring(0, 150) : 'unknown' });
    return false;
  }
}

const db = getDatabase();
db.testConnection = testConnection;
db.isConnected = () => isConnected;

module.exports = db;

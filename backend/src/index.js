require('dotenv').config();

// ─── Global DNS Fallback (Bypasses broken system DNS) ──────────────────────────
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  const originalLookup = dns.lookup;
  dns.lookup = function(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return originalLookup(hostname, options, callback);
    }
    const isAll = options && options.all;
    dns.resolve4(hostname, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        return originalLookup(hostname, options, callback);
      }
      if (isAll) {
        const results = addresses.map(addr => ({ address: addr, family: 4 }));
        callback(null, results);
      } else {
        callback(null, addresses[0], 4);
      }
    });
  };
} catch (dnsErr) {
  console.warn('Failed to initialize global DNS fallback:', dnsErr.message);
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const logger = require('./config/logger');
const { initSocket } = require('./utils/socket');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth.routes');
const requestRoutes = require('./routes/requests.routes');
const telegramRoutes = require('./routes/telegram.routes');
const usersRoutes = require('./routes/users.routes');
const notificationRoutes = require('./routes/notifications.routes');
const settingsRoutes = require('./routes/settings.routes');
const feedbackRoutes = require('./routes/feedback.routes');
const errorsRoutes = require('./routes/errors.routes');

// Services
const { startAllListeners } = require('./services/telegram/listener');
const { initCronJobs } = require('./jobs/archiver');

const app = express();
const httpServer = http.createServer(app);

// ─── Socket.io Setup ──────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
initSocket(io);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) },
}));

// ─── Unrestricted Routes (Health & Diagnostics) ───────────────────────────────
app.get('/api/health', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const db = require('./config/database');
  const { activeClients, messageQueue } = require('./services/telegram/listener');

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
  };

  // Check Database connection
  try {
    await db.$queryRawUnsafe('SELECT 1');
    health.database = 'connected';
  } catch (e) {
    health.database = 'disconnected';
    health.dbError = e.message ? e.message.substring(0, 100) : 'unknown';
  }

  // Check Telegram listener status
  try {
    const activePhones = [];
    const accounts = await db.telegramAccount.findMany({
      where: { isActive: true },
      select: { id: true, phone: true }
    });
    for (const [id, client] of activeClients.entries()) {
      const acc = accounts.find(a => a.id === id);
      activePhones.push({
        phone: acc ? acc.phone : 'unknown',
        connected: client.connected,
      });
    }

    health.telegram = {
      activeListenersCount: activeClients.size,
      activeListeners: activePhones,
      monitoredGroupsCount: await db.monitoredGroup.count(),
      activeGroupsCount: await db.monitoredGroup.count({ where: { isActive: true } }),
      requestsCount: await db.request.count(),
      queueStats: messageQueue ? messageQueue.getStats() : null,
    };
  } catch (err) {
    health.telegramError = err.message;
  }

  // Check key environment variables
  health.envCheck = {
    OPENAI_API_KEY_EXISTS: !!process.env.OPENAI_API_KEY,
    OPENAI_API_KEY_IS_PLACEHOLDER: process.env.OPENAI_API_KEY === 'sk-placeholder',
    TELEGRAM_API_ID_EXISTS: !!process.env.TELEGRAM_API_ID,
    TELEGRAM_API_HASH_EXISTS: !!process.env.TELEGRAM_API_HASH,
    TELEGRAM_BOT_TOKEN_EXISTS: !!process.env.TELEGRAM_BOT_TOKEN,
    FORWARD_CHANNEL_ID_EXISTS: !!process.env.FORWARD_CHANNEL_ID,
  };

  // Read last 150 lines of combined log
  try {
    const logPath = path.join(__dirname, '../logs/combined.log');
    if (fs.existsSync(logPath)) {
      const fileContent = fs.readFileSync(logPath, 'utf8');
      health.combinedLogs = fileContent.split('\n').slice(-150);
    } else {
      health.combinedLogs = 'combined.log file does not exist';
    }
  } catch (logErr) {
    health.combinedLogsError = logErr.message;
  }

  // Read last 150 lines of error log
  try {
    const errLogPath = path.join(__dirname, '../logs/error.log');
    if (fs.existsSync(errLogPath)) {
      const fileContent = fs.readFileSync(errLogPath, 'utf8');
      health.errorLogs = fileContent.split('\n').slice(-150);
    } else {
      health.errorLogs = 'error.log file does not exist';
    }
  } catch (logErr) {
    health.errorLogsError = logErr.message;
  }

  res.status(200).json(health);
});

// Rate limiting
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/errors', errorsRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Socket.io Authentication ─────────────────────────────────────────────────
const { verifyToken } = require('./utils/jwt');
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = verifyToken(token);
    socket.userId = decoded.userId;
    socket.userRole = decoded.role;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id} (user: ${socket.userId})`);
  socket.join(`user:${socket.userId}`);
  if (socket.userRole === 'ADMIN') socket.join('admins');

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, async () => {
  logger.info(`🚀 Enjaz Backend running on port ${PORT}`);
  logger.info(`📡 Environment: ${process.env.NODE_ENV}`);  // Run raw SQL migrations asynchronously to avoid blocking port scan
  setTimeout(async () => {
    const db = require('./config/database');
    try {
      logger.info('🔄 Running raw SQL database migrations...');
      
      // 1. Add columns to requests
      await db.$executeRawUnsafe(`ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "adminFeedback" TEXT;`).catch(()=>{});
      await db.$executeRawUnsafe(`ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "groupUsername" TEXT;`).catch(()=>{});
      await db.$executeRawUnsafe(`ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "groupLink" TEXT;`).catch(()=>{});
      await db.$executeRawUnsafe(`ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "messageId" TEXT;`).catch(()=>{});

      // 2. Add columns to monitored_groups
      await db.$executeRawUnsafe(`ALTER TABLE "monitored_groups" ADD COLUMN IF NOT EXISTS "groupUsername" TEXT;`).catch(()=>{});
      await db.$executeRawUnsafe(`ALTER TABLE "monitored_groups" ADD COLUMN IF NOT EXISTS "groupLink" TEXT;`).catch(()=>{});
      await db.$executeRawUnsafe(`ALTER TABLE "monitored_groups" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN DEFAULT false;`).catch(()=>{});

      // 3. Create classification_feedback table
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "classification_feedback" (
          "id" TEXT PRIMARY KEY,
          "requestId" TEXT NOT NULL REFERENCES "requests"("id") ON DELETE CASCADE,
          "adminId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
          "feedbackType" TEXT NOT NULL,
          "originalScore" DOUBLE PRECISION NOT NULL,
          "notes" TEXT,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `).catch(()=>{});
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "classification_feedback_feedbackType_idx" ON "classification_feedback"("feedbackType");`).catch(()=>{});
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "classification_feedback_createdAt_idx" ON "classification_feedback"("createdAt");`).catch(()=>{});

      // 4. Create processing_errors table
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "processing_errors" (
          "id" TEXT PRIMARY KEY,
          "messageText" TEXT,
          "groupName" TEXT,
          "groupId" TEXT,
          "accountPhone" TEXT,
          "errorType" TEXT NOT NULL,
          "errorMessage" TEXT NOT NULL,
          "errorStack" TEXT,
          "rawData" TEXT,
          "resolved" BOOLEAN DEFAULT false,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `).catch(()=>{});
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "processing_errors_errorType_idx" ON "processing_errors"("errorType");`).catch(()=>{});
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "processing_errors_createdAt_idx" ON "processing_errors"("createdAt");`).catch(()=>{});
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "processing_errors_resolved_idx" ON "processing_errors"("resolved");`).catch(()=>{});

      logger.info('✅ Raw SQL database migrations completed');
    } catch (migErr) {
      logger.error('❌ Raw SQL database migrations failed:', { error: migErr.message });
    }
  }, 1000);
  // Test database connection (don't crash if it fails)
  const db = require('./config/database');
  const dbConnected = await db.testConnection();

  if (!dbConnected) {
    logger.warn('⚠️ Server started WITHOUT database connection. Some features may not work.');
    logger.warn('⚠️ Database will be retried when requests come in.');
  }

  // Initialize Cron Jobs (only if DB is connected)
  if (dbConnected) {
    initCronJobs();
    logger.info('⏰ Cron jobs initialized');
  } else {
    logger.warn('⏰ Cron jobs skipped (no database connection)');
  }

  // Start Telegram Listeners (with delay, only if DB is connected)
  if (dbConnected) {
    setTimeout(async () => {
      try {
        await startAllListeners();
        logger.info('📱 Telegram listeners started');
      } catch (error) {
        logger.error('Failed to start Telegram listeners:', error.message || error);
      }
    }, 3000);
  } else {
    logger.warn('📱 Telegram listeners skipped (no database connection)');
  }
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  
  httpServer.close(async () => {
    logger.info('HTTP server closed');
    
    // Disconnect active GramJS clients
    const { activeClients } = require('./services/telegram/listener');
    if (activeClients && activeClients.size > 0) {
      logger.info(`Disconnecting ${activeClients.size} active Telegram clients...`);
      const disconnectPromises = [];
      for (const [id, client] of activeClients.entries()) {
        disconnectPromises.push(
          client.disconnect()
            .then(() => logger.info(`Disconnected Telegram client for account ID ${id}`))
            .catch((err) => logger.error(`Error disconnecting client ${id}:`, { error: err.message }))
        );
      }
      await Promise.allSettled(disconnectPromises);
    }
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { reason: reason instanceof Error ? reason.message : String(reason) });
});

module.exports = { app, io };

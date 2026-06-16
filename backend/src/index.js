require('dotenv').config();
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
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
  };

  // Try to check DB but don't fail if it's not available
  try {
    const db = require('./config/database');
    await db.$queryRawUnsafe('SELECT 1');
    health.database = 'connected';
  } catch (e) {
    health.database = 'disconnected';
    health.dbError = e.message ? e.message.substring(0, 100) : 'unknown';
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
  logger.info(`📡 Environment: ${process.env.NODE_ENV}`);

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
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { reason: reason instanceof Error ? reason.message : String(reason) });
});

module.exports = { app, io };

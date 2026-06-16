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
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

app.get('/api/test-regions', async (req, res) => {
  const { PrismaClient } = require('@prisma/client');
  const regions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1',
    'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1',
    'ap-northeast-1', 'ap-northeast-2', 'ap-south-1', 'ap-southeast-1', 'ap-southeast-2',
    'sa-east-1', 'me-central-1'
  ];
  
  const results = [];
  let found = null;
  
  for (const region of regions) {
    const url = `postgresql://postgres.lxnlsfubhfzflkkwaams:N7%23vQ9%21mZ4%40xL2%24Rp8%5ETq6@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true`;
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: url
        }
      }
    });
    
    try {
      const result = await Promise.race([
        prisma.$queryRaw`SELECT 1 as result`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
      ]);
      results.push({ region, status: 'SUCCESS' });
      found = url;
      await prisma.$disconnect();
      break;
    } catch (err) {
      results.push({ region, status: 'FAILED', error: err.message.split('\n')[0] });
      await prisma.$disconnect();
    }
  }
  
  res.json({ results, found });
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

  // Initialize Cron Jobs
  initCronJobs();
  logger.info('⏰ Cron jobs initialized');

  // Start Telegram Listeners (with delay to let server stabilize)
  setTimeout(async () => {
    try {
      await startAllListeners();
      logger.info('📱 Telegram listeners started');
    } catch (error) {
      logger.error('Failed to start Telegram listeners:', error);
    }
  }, 3000);
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
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, io };

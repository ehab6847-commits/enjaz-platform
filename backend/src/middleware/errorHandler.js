const logger = require('../config/logger');

/**
 * Global error handling middleware for Express
 */
function errorHandler(err, req, res, next) {
  // Log the error
  logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  if (err.stack) logger.debug(err.stack);

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'هذا السجل موجود بالفعل',
      field: err.meta?.target?.[0],
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'السجل غير موجود' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'رمز المصادقة غير صالح' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'انتهت صلاحية رمز المصادقة' });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'بيانات غير صالحة',
      details: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Default error
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'حدث خطأ داخلي في الخادم';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;

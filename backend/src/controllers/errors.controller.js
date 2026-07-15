'use strict';

const db = require('../config/database');
const logger = require('../config/logger');

/**
 * GET /api/errors - List processing errors
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const listErrors = async (req, res) => {
  try {
    const { page = 1, limit = 20, errorType, resolved } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {};
    if (errorType) where.errorType = errorType;
    if (resolved !== undefined) where.resolved = resolved === 'true';

    const [errors, total] = await Promise.all([
      db.processingError.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      db.processingError.count({ where }),
    ]);

    res.json({
      data: errors,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    logger.error('Error listing processing errors', { error: err.message });
    res.status(500).json({ error: 'حدث خطأ' });
  }
};

/**
 * PUT /api/errors/:id - Mark error as resolved
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const resolveError = async (req, res) => {
  try {
    const error = await db.processingError.update({
      where: { id: req.params.id },
      data: { resolved: true },
    });
    res.json({ success: true, error });
  } catch (err) {
    logger.error('Error resolving processing error', { error: err.message });
    res.status(500).json({ error: 'حدث خطأ' });
  }
};

/**
 * GET /api/errors/stats - Error statistics
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getErrorStats = async (req, res) => {
  try {
    const [total, unresolved, byType] = await Promise.all([
      db.processingError.count(),
      db.processingError.count({ where: { resolved: false } }),
      db.processingError.groupBy({
        by: ['errorType'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    res.json({
      total,
      unresolved,
      byType: byType.map(t => ({ type: t.errorType, count: t._count.id })),
    });
  } catch (err) {
    logger.error('Error getting error stats', { error: err.message });
    res.status(500).json({ error: 'حدث خطأ' });
  }
};

module.exports = { listErrors, resolveError, getErrorStats };

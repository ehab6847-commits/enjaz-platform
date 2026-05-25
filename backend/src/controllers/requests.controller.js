'use strict';

const db = require('../config/database');
const logger = require('../config/logger');

// ─── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/requests
 * Returns paginated list of requests with optional filters.
 */
const listRequests = async (req, res, next) => {
  try {
    const {
      country,
      serviceType,
      status,
      priority,
      search,
      page,
      limit,
      sortBy,
      sortOrder,
      isAdvertiser,
    } = req.query;

    const skip = (page - 1) * limit;

    // Build dynamic WHERE clause
    const where = {};

    if (country) where.country = { equals: country, mode: 'insensitive' };
    if (serviceType) where.serviceType = { equals: serviceType, mode: 'insensitive' };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (typeof isAdvertiser === 'boolean') where.isAdvertiser = isAdvertiser;

    if (search) {
      where.OR = [
        { messageText: { contains: search, mode: 'insensitive' } },
        { senderName: { contains: search, mode: 'insensitive' } },
        { senderUsername: { contains: search, mode: 'insensitive' } },
        { groupName: { contains: search, mode: 'insensitive' } },
        { university: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [requests, total] = await Promise.all([
      db.request.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      db.request.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data: requests,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/requests/stats
 * Returns aggregate statistics for dashboard.
 */
const getStats = async (req, res, next) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      total,
      newCount,
      viewedCount,
      assignedCount,
      archivedCount,
      urgentCount,
      last24hCount,
      last7dCount,
      byServiceType,
      byCountry,
      byPriority,
    ] = await Promise.all([
      db.request.count(),
      db.request.count({ where: { status: 'NEW' } }),
      db.request.count({ where: { status: 'VIEWED' } }),
      db.request.count({ where: { status: 'ASSIGNED' } }),
      db.request.count({ where: { status: 'ARCHIVED' } }),
      db.request.count({ where: { priority: 'URGENT' } }),
      db.request.count({ where: { capturedAt: { gte: last24h } } }),
      db.request.count({ where: { capturedAt: { gte: last7d } } }),
      db.request.groupBy({
        by: ['serviceType'],
        _count: { serviceType: true },
        where: { serviceType: { not: null } },
        orderBy: { _count: { serviceType: 'desc' } },
        take: 10,
      }),
      db.request.groupBy({
        by: ['country'],
        _count: { country: true },
        where: { country: { not: null } },
        orderBy: { _count: { country: 'desc' } },
        take: 10,
      }),
      db.request.groupBy({
        by: ['priority'],
        _count: { priority: true },
      }),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        total,
        byStatus: { new: newCount, viewed: viewedCount, assigned: assignedCount, archived: archivedCount },
        byPriority: byPriority.reduce((acc, item) => {
          acc[item.priority.toLowerCase()] = item._count.priority;
          return acc;
        }, {}),
        urgent: urgentCount,
        last24h: last24hCount,
        last7d: last7dCount,
        topServiceTypes: byServiceType.map((s) => ({
          serviceType: s.serviceType,
          count: s._count.serviceType,
        })),
        topCountries: byCountry.map((c) => ({
          country: c.country,
          count: c._count.country,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/requests/:id
 * Returns a single request by ID and marks it as VIEWED.
 */
const getRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    const request = await db.request.findUnique({ where: { id } });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    // Auto-mark as VIEWED if it was NEW
    if (request.status === 'NEW') {
      await db.request.update({
        where: { id },
        data: { status: 'VIEWED' },
      });
      request.status = 'VIEWED';
    }

    return res.status(200).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/requests/:id/status
 * Updates the status and/or priority of a request.
 */
const updateRequestStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, priority } = req.body;

    const existing = await db.request.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (status === 'ARCHIVED') updateData.archivedAt = new Date();

    const updated = await db.request.update({
      where: { id },
      data: updateData,
    });

    logger.info('Request status updated', {
      requestId: id,
      by: req.user.id,
      changes: updateData,
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/requests/:id
 * Permanently deletes a request.
 */
const deleteRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await db.request.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    await db.request.delete({ where: { id } });

    logger.info('Request deleted', { requestId: id, by: req.user.id });

    return res.status(200).json({ success: true, message: 'Request deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listRequests,
  getStats,
  getRequest,
  updateRequestStatus,
  deleteRequest,
};

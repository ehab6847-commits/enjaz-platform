'use strict';

const express = require('express');
const router = express.Router();
const { z } = require('zod');

const requestsController = require('../controllers/requests.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ─── Validation Schemas ────────────────────────────────────────────────────────
const listQuerySchema = z.object({
  country: z.string().optional(),
  serviceType: z.string().optional(),
  status: z.enum(['NEW', 'VIEWED', 'ASSIGNED', 'ARCHIVED']).optional(),
  priority: z.enum(['URGENT', 'NORMAL', 'LOW']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['capturedAt', 'priority', 'confidenceScore']).default('capturedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  isAdvertiser: z.coerce.boolean().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['NEW', 'VIEWED', 'ASSIGNED', 'ARCHIVED']),
  priority: z.enum(['URGENT', 'NORMAL', 'LOW']).optional(),
});

// ─── Routes ────────────────────────────────────────────────────────────────────

// All request routes require authentication
router.use(authenticate);

/**
 * @route  GET /api/requests
 * @desc   List all requests with filters and pagination
 * @access Private
 */
router.get('/', validate({ query: listQuerySchema }), requestsController.listRequests);

/**
 * @route  GET /api/requests/stats
 * @desc   Get aggregated statistics for the dashboard
 * @access Private
 */
router.get('/stats', requestsController.getStats);

/**
 * @route  GET /api/requests/:id
 * @desc   Get a single request by ID
 * @access Private
 */
router.get('/:id', requestsController.getRequest);

/**
 * @route  PUT /api/requests/:id/status
 * @desc   Update request status and/or priority
 * @access Private
 */
router.put('/:id/status', validate({ body: updateStatusSchema }), requestsController.updateRequestStatus);

/**
 * @route  DELETE /api/requests/:id
 * @desc   Delete a request (admin only effectively)
 * @access Private
 */
router.delete('/:id', requireAdmin, requestsController.deleteRequest);

module.exports = router;

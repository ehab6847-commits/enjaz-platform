'use strict';

const express = require('express');
const router = express.Router();
const { z } = require('zod');

const usersController = require('../controllers/users.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ─── Validation Schemas ────────────────────────────────────────────────────────
const updateUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  email: z.string().email().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'BLOCKED']).optional(),
  role: z.enum(['ADMIN', 'SPECIALIST']).optional(),
});

// ─── Routes ────────────────────────────────────────────────────────────────────

// All user management routes require authentication + admin role
router.use(authenticate, requireAdmin);

/**
 * @route  GET /api/users
 * @desc   List all users with optional filters
 * @access Admin
 */
router.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(['PENDING', 'ACTIVE', 'BLOCKED']).optional(),
      role: z.enum(['ADMIN', 'SPECIALIST']).optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  usersController.listUsers
);

/**
 * @route  GET /api/users/:id
 * @desc   Get a single user by ID
 * @access Admin
 */
router.get('/:id', usersController.getUser);

/**
 * @route  PUT /api/users/:id
 * @desc   Update user details
 * @access Admin
 */
router.put('/:id', validate({ body: updateUserSchema }), usersController.updateUser);

/**
 * @route  POST /api/users/:id/approve
 * @desc   Approve a pending specialist account
 * @access Admin
 */
router.post('/:id/approve', usersController.approveUser);

/**
 * @route  POST /api/users/:id/reject
 * @desc   Reject (block) a pending/active specialist account
 * @access Admin
 */
router.post('/:id/reject', usersController.rejectUser);

/**
 * @route  DELETE /api/users/:id
 * @desc   Permanently delete a user
 * @access Admin
 */
router.delete('/:id', usersController.deleteUser);

module.exports = router;

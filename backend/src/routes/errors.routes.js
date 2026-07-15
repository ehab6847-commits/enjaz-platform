'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { listErrors, resolveError, getErrorStats } = require('../controllers/errors.controller');

router.get('/', authenticate, requireAdmin, listErrors);
router.get('/stats', authenticate, requireAdmin, getErrorStats);
router.put('/:id', authenticate, requireAdmin, resolveError);

module.exports = router;

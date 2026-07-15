'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { addFeedback, getFeedbackStats } = require('../controllers/feedback.controller');

router.post('/', authenticate, requireAdmin, addFeedback);
router.get('/stats', authenticate, requireAdmin, getFeedbackStats);

module.exports = router;

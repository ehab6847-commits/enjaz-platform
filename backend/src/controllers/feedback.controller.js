'use strict';

const db = require('../config/database');
const logger = require('../config/logger');

/**
 * POST /api/feedback - Add feedback for a request
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const addFeedback = async (req, res) => {
  try {
    const { requestId, feedbackType, notes } = req.body;
    const adminId = req.user.id;

    if (!requestId || !feedbackType) {
      return res.status(400).json({ error: 'requestId و feedbackType مطلوبان' });
    }

    const validTypes = ['correct', 'wrong_request', 'advertiser', 'spam', 'ignore'];
    if (!validTypes.includes(feedbackType)) {
      return res.status(400).json({ error: 'نوع التقييم غير صالح' });
    }

    // Get the request to capture original score
    const request = await db.request.findUnique({ where: { id: requestId } });
    if (!request) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // Create feedback
    const feedback = await db.classificationFeedback.create({
      data: {
        requestId,
        adminId,
        feedbackType,
        originalScore: request.confidenceScore,
        notes: notes || null,
      },
    });

    // Update request with admin feedback
    await db.request.update({
      where: { id: requestId },
      data: { adminFeedback: feedbackType },
    });

    logger.info('Admin feedback recorded', { requestId, feedbackType, adminId });

    res.json({ success: true, feedback });
  } catch (err) {
    logger.error('Error adding feedback', { error: err.message });
    res.status(500).json({ error: 'حدث خطأ أثناء حفظ التقييم' });
  }
};

/**
 * GET /api/feedback/stats - Get feedback statistics
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getFeedbackStats = async (req, res) => {
  try {
    const [total, correct, wrongRequest, advertiser, spam, ignore] = await Promise.all([
      db.classificationFeedback.count(),
      db.classificationFeedback.count({ where: { feedbackType: 'correct' } }),
      db.classificationFeedback.count({ where: { feedbackType: 'wrong_request' } }),
      db.classificationFeedback.count({ where: { feedbackType: 'advertiser' } }),
      db.classificationFeedback.count({ where: { feedbackType: 'spam' } }),
      db.classificationFeedback.count({ where: { feedbackType: 'ignore' } }),
    ]);

    const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;

    res.json({
      total,
      correct,
      wrongRequest,
      advertiser,
      spam,
      ignore,
      accuracy: Number(accuracy),
    });
  } catch (err) {
    logger.error('Error getting feedback stats', { error: err.message });
    res.status(500).json({ error: 'حدث خطأ' });
  }
};

module.exports = { addFeedback, getFeedbackStats };

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Get all settings (admin only)
router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const settings = await prisma.systemSetting.findMany();
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
    res.json(settingsMap);
  } catch (error) {
    next(error);
  }
});

// Update a setting (admin only)
router.put('/:key', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'القيمة مطلوبة' });
    }

    const setting = await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    });

    res.json(setting);
  } catch (error) {
    next(error);
  }
});

// Update multiple settings at once
router.put('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const updates = req.body;
    const results = [];

    for (const [key, value] of Object.entries(updates)) {
      const setting = await prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
      results.push(setting);
    }

    res.json({ updated: results.length, settings: results });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

const express = require('express');
const router  = express.Router();
const store   = require('../store/dataStore');

// GET /api/history/:email/stats
router.get('/:email/stats', async (req, res) => {
  const email   = req.params.email.toLowerCase();
  const history = await store.getHistory(email);

  if (history.length === 0) {
    return res.status(200).json({
      success: true,
      stats: {
        totalVisits: 0,
        completedVisits: 0,
        leftEarly: 0,
        averageWaitTime: 0,
        totalWaitTime: 0,
        mostUsedService: null
      }
    });
  }

  const completedVisits = history.filter(h => h.status === 'completed' || h.status === 'served').length;
  const leftEarly       = history.filter(h => h.status === 'left').length;
  const totalWait       = history.reduce((sum, h) => sum + (h.waitTimeMinutes || 0), 0);
  const averageWait     = history.length ? Math.round(totalWait / history.length) : 0;

  const serviceCounts = {};
  history.forEach(h => {
    serviceCounts[h.serviceName] = (serviceCounts[h.serviceName] || 0) + 1;
  });

  let mostUsedService = null;
  let maxCount = 0;
  for (const [name, count] of Object.entries(serviceCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostUsedService = name;
    }
  }

  return res.status(200).json({
    success: true,
    stats: {
      totalVisits: history.length,
      completedVisits,
      leftEarly,
      averageWaitTime: averageWait,
      totalWaitTime: totalWait,
      mostUsedService
    }
  });
});

// GET /api/history/:email
router.get('/:email', async (req, res) => {
  const emailParam = req.params.email.toLowerCase();
  const { status, serviceId, startDate, endDate } = req.query;

  let history = await store.getHistory(emailParam);

  const validStatuses = ['completed', 'served', 'left'];
  if (status) {
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        errors: [`status must be one of: ${validStatuses.join(', ')}`]
      });
    }
    history = history.filter(h => h.status === status);
  }

  if (serviceId) {
    const sid = parseInt(serviceId, 10);
    if (isNaN(sid)) {
      return res.status(400).json({ success: false, errors: ['serviceId must be a number'] });
    }
    history = history.filter(h => h.serviceId === sid);
  }

  if (startDate) {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return res.status(400).json({ success: false, errors: ['Invalid startDate'] });
    }
    history = history.filter(h => h.completedAt && new Date(h.completedAt) >= start);
  }

  if (endDate) {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      return res.status(400).json({ success: false, errors: ['Invalid endDate'] });
    }
    end.setHours(23, 59, 59, 999);
    history = history.filter(h => h.completedAt && new Date(h.completedAt) <= end);
  }

  history.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

  return res.status(200).json({
    success: true,
    count: history.length,
    history
  });
});

// DELETE /api/history/:email
router.delete('/:email', async (req, res) => {
  const email = req.params.email.toLowerCase();

  await store.clearHistory(email);

  return res.status(200).json({
    success: true,
    message: 'History cleared'
  });
});

module.exports = router;
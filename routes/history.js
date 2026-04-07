// routes/history.js
const express = require('express');
const router  = express.Router();
const store   = require('../store/dataStore');

// ── GET /api/history/:email/stats ─────────────────────────────────────────────
router.get('/:email/stats', async (req, res) => {
  const email   = req.params.email.toLowerCase();
  const history = await store.getHistory(email);

  if (history.length === 0) {
    return res.status(200).json({
      success: true,
      stats: { totalVisits: 0, completedVisits: 0, leftEarly: 0, averageWaitTime: 0, totalWaitTime: 0, mostUsedService: null }
    });
  }

  const completedVisits = history.filter(h => h.status === 'completed' || h.status === 'served').length;
  const leftEarly       = history.filter(h => h.status === 'left').length;
  const totalWait       = history.reduce((sum, h) => sum + (h.waitTimeMinutes || 0), 0);
  const averageWait     = history.length ? Math.round(totalWait / history.length) : 0;

  const serviceCounts = {};
  history.forEach(h => serviceCounts[h.serviceName] = (serviceCounts[h.serviceName] || 0) + 1);
  let mostUsedService = null;
  let maxCount = 0;
  for (const [name, count] of Object.entries(serviceCounts)) {
    if (count > maxCount) { maxCount = count; mostUsedService = name; }
  }

  return res.status(200).json({
    success: true,
    stats: {
      totalVisits:     history.length,
      completedVisits,
      leftEarly,
      averageWaitTime: averageWait,
      totalWaitTime:   totalWait,
      mostUsedService
    }
  });
});

// ── GET /api/history/:email ───────────────────────────────────────────────────
// Supports ?all=true for admins (shows every user's history)
router.get('/:email', async (req, res) => {
  const emailParam = req.params.email.toLowerCase();
  const { status, serviceId, startDate, endDate, all } = req.query;

  let history =  await store.getHistory(emailParam);

  // ADMIN GLOBAL VIEW
  if (all !== 'true') {
    history = history.filter(h => h.userEmail === emailParam);
  }

  // Status filter
  const validStatuses = ['completed', 'served', 'left'];
  if (status) {
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, errors: [`status must be one of: ${validStatuses.join(', ')}`] });
    }
    history = history.filter(h => h.status === status);
  }

  // Service filter
  if (serviceId) {
    const sid = parseInt(serviceId, 10);
    if (isNaN(sid)) return res.status(400).json({ success: false, errors: ['serviceId must be a number'] });
    history = history.filter(h => h.serviceId === sid);
  }

  // Date filters
  if (startDate) {
    const start = new Date(startDate);
    if (isNaN(start)) return res.status(400).json({ success: false, errors: ['Invalid startDate'] });
    history = history.filter(h => new Date(h.completedAt) >= start);
  }
  if (endDate) {
    const end = new Date(endDate);
    if (isNaN(end)) return res.status(400).json({ success: false, errors: ['Invalid endDate'] });
    end.setHours(23, 59, 59, 999);
    history = history.filter(h => new Date(h.completedAt) <= end);
  }

  // Sort newest first
  history.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  return res.status(200).json({ 
    success: true, 
    count: history.length, 
    history 
  });
});

// ── DELETE /api/history/:email ────────────────────────────────────────────────
router.delete('/:email', async (req, res) => {
  const email  = req.params.email.toLowerCase();
  
  const removed = await store.clearHistory(email);
  return res.status(200).json({ success: true, message: `Removed ${removed} history entries` });
});

module.exports = router;
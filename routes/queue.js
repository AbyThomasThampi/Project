// routes/queue.js
// Queue Management Module + Wait-Time Estimation Logic
const { requireEmail, requireAdmin } = require('../middleware/authz');
const express = require('express');
const router  = express.Router();
const store   = require('../store/dataStore');
const { createNotification } = require('./notifications');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calculate estimated wait time for a given position.
 * Rule-based: position × service.expectedDuration (minutes).
 * Position is 1-indexed.
 */
function calculateWait(serviceId, position) {
  const service = store.services.find(s => s.id === serviceId);
  const duration = service ? service.expectedDuration : 30;
  return position * duration;
}

/**
 * Ensure queue array exists for a service.
 */
function ensureQueue(serviceId) {
  if (!store.queues[serviceId]) store.queues[serviceId] = [];
}

// ── GET /api/queue/:serviceId ─────────────────────────────────────────────────
// View current queue for a service (admin)
router.get('/:serviceId',requireAdmin, (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const service   = store.services.find(s => s.id === serviceId);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  ensureQueue(serviceId);
  const queue = store.queues[serviceId];

  // Annotate each entry with its live position and estimated wait
  const annotated = queue.map((entry, idx) => ({
    ...entry,
    position:    idx + 1,
    estimatedWait: calculateWait(serviceId, idx + 1)
  }));

  return res.status(200).json({
    success: true,
    serviceId,
    serviceName: service.name,
    queueLength: queue.length,
    estimatedWaitForNext: calculateWait(serviceId, queue.length + 1),
    queue: annotated
  });
});

// ── POST /api/queue/:serviceId/join ───────────────────────────────────────────
// User joins a queue
// Body: { email }
router.post('/:serviceId/join', requireEmail, (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const { email } = req.body;

  // Validations
  if (!email || typeof email !== 'string' || email.trim() === '') {
    return res.status(400).json({ success: false, errors: ["'email' is required"] });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, errors: ['Invalid email format'] });
  }

  const service = store.services.find(s => s.id === serviceId);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  ensureQueue(serviceId);
  const queue       = store.queues[serviceId];
  const normalEmail = email.trim().toLowerCase();

  if (queue.some(e => e.email === normalEmail)) {
    return res.status(409).json({ success: false, errors: ['You are already in this queue'] });
  }

  const entry = {
    email:    normalEmail,
    joinedAt: new Date().toISOString(),
    priority: 'medium'
  };
  queue.push(entry);

  const position = queue.length;
  const wait     = calculateWait(serviceId, position);

  // Trigger join notification
  createNotification(
    normalEmail,
    'success',
    `Joined ${service.name}`,
    `You are at position #${position} — estimated wait: ${wait} minutes`,
    serviceId
  );

  return res.status(201).json({
    success: true,
    message: `Joined ${service.name}`,
    position,
    estimatedWait: wait
  });
});

// ── DELETE /api/queue/:serviceId/leave ────────────────────────────────────────
// User leaves a queue
// Body: { email }
router.delete('/:serviceId/leave', requireEmail, (req, res) => {
  const serviceId   = parseInt(req.params.serviceId, 10);
  const { email }   = req.body;

  if (!email) {
    return res.status(400).json({ success: false, errors: ["'email' is required"] });
  }

  const service = store.services.find(s => s.id === serviceId);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  ensureQueue(serviceId);
  const queue       = store.queues[serviceId];
  const normalEmail = email.trim().toLowerCase();
  const before      = queue.length;

  // Record history as 'left'
  const entry = queue.find(e => e.email === normalEmail);
  if (entry) {
    recordHistory(serviceId, normalEmail, entry.joinedAt, 'left');
  }

  store.queues[serviceId] = queue.filter(e => e.email !== normalEmail);

  if (store.queues[serviceId].length === before) {
    return res.status(404).json({ success: false, errors: ['User not found in this queue'] });
  }

  return res.status(200).json({ success: true, message: 'Left the queue' });
});

// ── POST /api/queue/:serviceId/serve ─────────────────────────────────────────
// Admin: serve the next user in queue
router.post('/:serviceId/serve',requireAdmin, (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const service   = store.services.find(s => s.id === serviceId);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  ensureQueue(serviceId);
  const queue = store.queues[serviceId];
  if (queue.length === 0) {
    return res.status(400).json({ success: false, errors: ['Queue is empty'] });
  }

  const served = queue.shift();   // Remove first entry

  // Record completion
  recordHistory(serviceId, served.email, served.joinedAt, 'served');

  // Notify the remaining queue that they've moved up
  queue.forEach((entry, idx) => {
    createNotification(
      entry.email,
      'info',
      `Queue update — ${service.name}`,
      `You moved to position #${idx + 1}. Estimated wait: ${calculateWait(serviceId, idx + 1)} minutes`,
      serviceId
    );
  });

  return res.status(200).json({
    success: true,
    message: `Served ${served.email}`,
    served,
    remainingQueue: queue.length
  });
});

// ── PATCH /api/queue/:serviceId/priority ─────────────────────────────────────
// Admin: change a user's priority
// Body: { email, priority }
router.patch('/:serviceId/priority',requireAdmin, (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const { email, priority } = req.body;

  const validPriorities = ['low', 'medium', 'high'];
  if (!email)    return res.status(400).json({ success: false, errors: ["'email' is required"] });
  if (!priority || !validPriorities.includes(priority)) {
    return res.status(400).json({ success: false, errors: [`priority must be one of: ${validPriorities.join(', ')}`] });
  }

  ensureQueue(serviceId);
  const entry = store.queues[serviceId].find(e => e.email === email.trim().toLowerCase());
  if (!entry) {
    return res.status(404).json({ success: false, errors: ['User not found in this queue'] });
  }

  entry.priority = priority;
  return res.status(200).json({ success: true, message: `Priority updated to ${priority}`, entry });
});

// ── PATCH /api/queue/:serviceId/reorder ──────────────────────────────────────
// Admin: move an entry from one index to another
// Body: { fromIndex, toIndex }
router.patch('/:serviceId/reorder',requireAdmin, (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const { fromIndex, toIndex } = req.body;

  ensureQueue(serviceId);
  const queue = store.queues[serviceId];

  if (fromIndex === undefined || toIndex === undefined) {
    return res.status(400).json({ success: false, errors: ["'fromIndex' and 'toIndex' are required"] });
  }
  if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) {
    return res.status(400).json({ success: false, errors: ['Index out of bounds'] });
  }

  const [moved] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, moved);

  return res.status(200).json({ success: true, message: 'Queue reordered', queue });
});

// ── GET /api/queue/:serviceId/wait ────────────────────────────────────────────
// Wait-time estimate for the next person joining
router.get('/:serviceId/wait', requireEmail, (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const service   = store.services.find(s => s.id === serviceId);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  ensureQueue(serviceId);
  const qLen = store.queues[serviceId].length;
  const wait = calculateWait(serviceId, qLen + 1);

  return res.status(200).json({
    success: true,
    serviceId,
    queueLength:   qLen,
    estimatedWait: wait
  });
});

// ── Internal helper: record history entry ────────────────────────────────────
function recordHistory(serviceId, userEmail, joinedAt, status) {
  const service = store.services.find(s => s.id === serviceId);
  
  const entry = {
    id:               store.nextHistoryId(),
    serviceId,
    serviceName:      service ? service.name : 'Unknown Service',
    userEmail:        userEmail.toLowerCase(),
    joinedAt,
    completedAt:      new Date().toISOString(),
    status,                    // "served" or "left"
    waitTimeMinutes:  Math.floor((Date.now() - new Date(joinedAt)) / 60000)
  };

  store.history.push(entry);
  console.log(`✅ History recorded: ${userEmail} - ${status} for ${service ? service.name : 'service ' + serviceId}`);
  
  return entry;
}

module.exports = router;
module.exports.calculateWait = calculateWait;

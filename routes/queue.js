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
async function calculateWait(serviceId, position) {
  const service = await store.getServiceById(serviceId);
  const duration = service ? service.expectedDuration : 30;
  return position * duration;
}

/**
 * Ensure queue array exists for a service.
 */
//function ensureQueue(serviceId) {
//  if (!store.queues[serviceId]) store.queues[serviceId] = [];
//}

// ── GET /api/queue/:serviceId ─────────────────────────────────────────────────
// View current queue for a service
router.get('/:serviceId', requireEmail, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const service   = await store.getServiceById(serviceId);
  
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  // ensureQueue(serviceId);
  
  const queue = await store.getQueue(serviceId);

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
router.post('/:serviceId/join', requireEmail, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const { email } = req.body;

  // Validations
  if (!email || typeof email !== 'string' || email.trim() === '') {
    return res.status(400).json({ success: false, errors: ["'email' is required"] });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, errors: ['Invalid email format'] });
  }

  //const service = store.services.find(s => s.id === serviceId);
  //if (!service) {
  //  return res.status(404).json({ success: false, errors: ['Service not found'] });
  //}

  //ensureQueue(serviceId);
  
  
  const normalEmail = email.trim().toLowerCase();
  const service = await store.getServiceById(serviceId);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  const queue = await store.getQueue(serviceId);
  if (queue.some(e => e.email === normalEmail)) {
    return res.status(409).json({ success: false, errors: ['You are already in this queue'] });
  }

  await store.joinQueue(serviceId, { email: normalEmail, priority: 'medium' });

  //const entry = {
  //  email:    normalEmail,
  //  joinedAt: new Date().toISOString(),
  //  priority: 'medium'
  //};
  //queue.push(entry);

  const position = queue.length + 1;
  const wait     = await calculateWait(serviceId, position);

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
router.delete('/:serviceId/leave', requireEmail, async (req, res) => {
  const serviceId   = parseInt(req.params.serviceId, 10);
  const { email }   = req.body;

  if (!email) {
    return res.status(400).json({ success: false, errors: ["'email' is required"] });
  }

  const normalEmail = email.trim().toLowerCase();
  const service = await store.getServiceById(serviceId);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  //ensureQueue(serviceId);
  const queue = await store.getQueue(serviceId);
  const found = queue.find(e => e.email === normalEmail);

  if (!found) return res.status(404).json({ success: false, errors: ['User not found in this queue'] });

  // Record history as 'left'
  await store.addHistory({
    email: normalEmail,
    serviceId,
    status: 'left'
  });

  await store.leaveQueue(serviceId, normalEmail);

  return res.status(200).json({ success: true, message: 'Left the queue' });
});

// ── POST /api/queue/:serviceId/serve ─────────────────────────────────────────
// Admin: serve the next user in queue
router.post('/:serviceId/serve',requireAdmin, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const service   = store.services.find(s => s.id === serviceId);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  const queue = await store.getQueue(serviceId);  
  if (queue.length === 0) {
    return res.status(400).json({ success: false, errors: ['Queue is empty'] });
  }

  const served = await store.serveNext(serviceId);   // Remove first entry

  // Record completion
  await store.addHistory({
    email: served.email,
    serviceId,
    status: 'served'
  });
  
  // Notify the remaining queue that they've moved up
  const remainingQueue = await store.getQueue(serviceId);
  for (let i = 0; i < remainingQueue.length; i++) {
    const entry = remainingQueue[i];
    createNotification(
      entry.email,
      'info',
      `Queue update - ${service.name}`,
      `You moved to position #${i + 1}. Estimated wait: ${await calculateWait(serviceId, i + 1)} minutes`,
      serviceId
    );
  }

  return res.status(200).json({
    success: true,
    message: `Served ${served.email}`,
    served,
    remainingQueue: remainingQueue.length
  });
});

// ── PATCH /api/queue/:serviceId/priority ─────────────────────────────────────
// Admin: change a user's priority
// Body: { email, priority }
router.patch('/:serviceId/priority',requireAdmin, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const { email, priority } = req.body;

  const validPriorities = ['low', 'medium', 'high'];
  if (!email)    return res.status(400).json({ success: false, errors: ["'email' is required"] });
  if (!priority || !validPriorities.includes(priority)) {
    return res.status(400).json({ success: false, errors: [`priority must be one of: ${validPriorities.join(', ')}`] });
  }

  await store.updateQueuePriority(serviceId, email.trim().toLowerCase(), priority);

  return res.status(200).json({ success: true, message: `Priority updated to ${priority}`, entry });
});

// ── PATCH /api/queue/:serviceId/reorder ──────────────────────────────────────
// Admin: move an entry from one index to another
// Body: { fromIndex, toIndex }
router.patch('/:serviceId/reorder', requireAdmin, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const { fromIndex, toIndex } = req.body;

  const queue = await store.getQueue(serviceId);
  if (fromIndex === undefined || toIndex === undefined) {
    return res.status(400).json({ success: false, errors: ["'fromIndex' and 'toIndex' are required"] });
  }
  if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) {
    return res.status(400).json({ success: false, errors: ['Index out of bounds'] });
  }

  // Simple in-memory swap; DB persistence requires position column (future A4)
  const [moved] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, moved);

  return res.status(200).json({ success: true, message: 'Queue reordered', queue });
});

// ── GET /api/queue/:serviceId/wait ────────────────────────────────────────────
// Wait-time estimate for the next person joining
router.get('/:serviceId/wait', requireEmail, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const service = await store.getServiceById(serviceId);
  if (!service) return res.status(404).json({ success: false, errors: ['Service not found'] });

  const queue = await store.getQueue(serviceId);
  const wait = await calculateWait(serviceId, queue.length + 1);

  return res.status(200).json({
    success: true,
    serviceId,
    queueLength: queue.length,
    estimatedWait: wait
  });
});

// ── Internal helper: record history entry ────────────────────────────────────
// function recordHistory(serviceId, userEmail, joinedAt, status) {
//   const service = store.services.find(s => s.id === serviceId);
  
//   const entry = {
//     id:               store.nextHistoryId(),
//     serviceId,
//     serviceName:      service ? service.name : 'Unknown Service',
//     userEmail:        userEmail.toLowerCase(),
//     joinedAt,
//     completedAt:      new Date().toISOString(),
//     status,                    // "served" or "left"
//     waitTimeMinutes:  Math.floor((Date.now() - new Date(joinedAt)) / 60000)
//   };

//   store.history.push(entry);
//   console.log(`✅ History recorded: ${userEmail} - ${status} for ${service ? service.name : 'service ' + serviceId}`);
  
//   return entry;
// }

module.exports = router;
//module.exports.calculateWait = calculateWait;

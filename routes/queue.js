// routes/queue.js
const { requireEmail, requireAdmin } = require('../middleware/authz');
const express = require('express');
const router  = express.Router();
const store   = require('../store/dataStore');
const { createNotification } = require('./notifications');

// Calculate estimated wait time for a given position
async function calculateWait(serviceId, position) {
  const service = await store.getServiceById(serviceId);
  const duration = service ? service.expectedDuration : 30;
  return position * duration;
}

// GET /api/queue/:serviceId
router.get('/:serviceId', requireEmail, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const service   = await store.getServiceById(serviceId);

  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  const queue = await store.getQueue(serviceId);

  const annotated = await Promise.all(
    queue.map(async (entry, idx) => ({
      ...entry,
      position: idx + 1,
      estimatedWait: await calculateWait(serviceId, idx + 1)
    }))
  );

  return res.status(200).json({
    success: true,
    serviceId,
    serviceName: service.name,
    queueLength: queue.length,
    estimatedWaitForNext: await calculateWait(serviceId, queue.length + 1),
    queue: annotated
  });
});

// POST /api/queue/:serviceId/join
router.post('/:serviceId/join', requireEmail, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const { email } = req.body;

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({ success: false, errors: ['Invalid serviceId'] });
  }

  if (!email || typeof email !== 'string' || email.trim() === '') {
    return res.status(400).json({ success: false, errors: ["'email' is required"] });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, errors: ['Invalid email format'] });
  }

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

  const position = queue.length + 1;
  const wait = await calculateWait(serviceId, position);

  await createNotification(
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

// DELETE /api/queue/:serviceId/leave
router.delete('/:serviceId/leave', requireEmail, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const { email } = req.body;

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({ success: false, errors: ['Invalid serviceId'] });
  }

  if (!email) {
    return res.status(400).json({ success: false, errors: ["'email' is required"] });
  }

  const normalEmail = email.trim().toLowerCase();
  const service = await store.getServiceById(serviceId);

  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  const queue = await store.getQueue(serviceId);
  const found = queue.find(e => e.email === normalEmail);

  if (!found) {
    return res.status(404).json({ success: false, errors: ['User not found in this queue'] });
  }

  await store.addHistory({
    email: normalEmail,
    serviceId,
    status: 'left'
  });

  await store.leaveQueue(serviceId, normalEmail);

  return res.status(200).json({ success: true, message: 'Left the queue' });
});

// POST /api/queue/:serviceId/serve
router.post('/:serviceId/serve', requireAdmin, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const service = await store.getServiceById(serviceId);

  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  const queue = await store.getQueue(serviceId);
  if (queue.length === 0) {
    return res.status(400).json({ success: false, errors: ['Queue is empty'] });
  }

  const served = await store.serveNext(serviceId);

  await store.addHistory({
    email: served.email,
    serviceId,
    status: 'served'
  });

  const remainingQueue = await store.getQueue(serviceId);
  for (let i = 0; i < remainingQueue.length; i++) {
    const entry = remainingQueue[i];
    const wait = await calculateWait(serviceId, i + 1);

    await createNotification(
      entry.email,
      'info',
      `Queue update - ${service.name}`,
      `You moved to position #${i + 1}. Estimated wait: ${wait} minutes`,
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

// PATCH /api/queue/:serviceId/priority
router.patch('/:serviceId/priority', requireAdmin, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const { email, priority } = req.body;

  const validPriorities = ['low', 'medium', 'high'];

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({ success: false, errors: ['Invalid serviceId'] });
  }

  if (!email) {
    return res.status(400).json({ success: false, errors: ["'email' is required"] });
  }

  if (!priority || !validPriorities.includes(priority)) {
    return res.status(400).json({
      success: false,
      errors: [`priority must be one of: ${validPriorities.join(', ')}`]
    });
  }

  const service = await store.getServiceById(serviceId);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const queue = await store.getQueue(serviceId);
  const existing = queue.find(entry => entry.email === normalizedEmail);

  if (!existing) {
    return res.status(404).json({ success: false, errors: ['User not found in this queue'] });
  }

  await store.updateQueuePriority(serviceId, normalizedEmail, priority);

  return res.status(200).json({
    success: true,
    message: `Priority updated to ${priority}`,
    entry: {
      ...existing,
      priority
    }
  });
});

// PATCH /api/queue/:serviceId/reorder
router.patch('/:serviceId/reorder', requireAdmin, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const { fromIndex, toIndex } = req.body;

  const service = await store.getServiceById(serviceId);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  const queue = await store.getQueue(serviceId);

  if (fromIndex === undefined || toIndex === undefined) {
    return res.status(400).json({ success: false, errors: ["'fromIndex' and 'toIndex' are required"] });
  }

  if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) {
    return res.status(400).json({ success: false, errors: ['Index out of bounds'] });
  }

  const reordered = [...queue];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  return res.status(200).json({
    success: true,
    message: 'Queue reordered',
    queue: reordered
  });
});

// GET /api/queue/:serviceId/wait
router.get('/:serviceId/wait', requireEmail, async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  const service = await store.getServiceById(serviceId);

  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  const queue = await store.getQueue(serviceId);
  const wait = await calculateWait(serviceId, queue.length + 1);

  return res.status(200).json({
    success: true,
    serviceId,
    queueLength: queue.length,
    estimatedWait: wait
  });
});

module.exports = router;

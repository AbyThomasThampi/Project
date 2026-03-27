// routes/services.js
// Service Management Module: create, read, update, delete services

const express = require('express');
const router  = express.Router();
const store   = require('../store/dataStore');
const { validateService, validate } = require('../middleware/validate');

// ── GET /api/services ────────────────────────────────────────────────────────
// List all services
router.get('/', (req, res) => {
  return res.status(200).json({ success: true, services: store.services });
});

// ── GET /api/services/:id ────────────────────────────────────────────────────
// Get a single service by ID
router.get('/:id', (req, res) => {
  const id      = parseInt(req.params.id, 10);
  const service = store.services.find(s => s.id === id);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }
  return res.status(200).json({ success: true, service });
});

// ── POST /api/services ───────────────────────────────────────────────────────
// Create a new service
// Body: { name, description, expectedDuration, priority? }
router.post('/', validate(validateService), (req, res) => {
  const { name, description, expectedDuration, priority = 'medium' } = req.body;

  const newService = {
    id:               store.nextServiceId(),
    name:             name.trim(),
    description:      description.trim(),
    expectedDuration: parseInt(expectedDuration, 10),
    priority
  };

  store.services.push(newService);
  // Initialize an empty queue for this service
  store.queues[newService.id] = [];

  return res.status(201).json({
    success: true,
    message: 'Service created',
    service: newService
  });
});

// ── PUT /api/services/:id ────────────────────────────────────────────────────
// Update an existing service
// Body: { name?, description?, expectedDuration?, priority? }
router.put('/:id', (req, res) => {
  const id      = parseInt(req.params.id, 10);
  const service = store.services.find(s => s.id === id);
  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  // Validate only the fields that were actually sent
  const patch  = req.body;
  const errors = [];

  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string' || patch.name.trim().length < 2) {
      errors.push('name must be at least 2 characters');
    } else if (patch.name.trim().length > 100) {
      errors.push('name must be ≤ 100 characters');
    }
  }

  if (patch.description !== undefined) {
    if (typeof patch.description !== 'string') errors.push('description must be a string');
    else if (patch.description.trim().length > 500) errors.push('description must be ≤ 500 characters');
  }

  if (patch.expectedDuration !== undefined) {
    const dur = Number(patch.expectedDuration);
    if (!Number.isInteger(dur) || dur < 5)  errors.push('expectedDuration must be an integer ≥ 5');
    if (dur > 480)                           errors.push('expectedDuration must be ≤ 480 minutes');
  }

  const validPriorities = ['low', 'medium', 'high'];
  if (patch.priority && !validPriorities.includes(patch.priority)) {
    errors.push(`priority must be one of: ${validPriorities.join(', ')}`);
  }

  if (errors.length) return res.status(400).json({ success: false, errors });

  // Apply updates
  if (patch.name             !== undefined) service.name             = patch.name.trim();
  if (patch.description      !== undefined) service.description      = patch.description.trim();
  if (patch.expectedDuration !== undefined) service.expectedDuration = parseInt(patch.expectedDuration, 10);
  if (patch.priority         !== undefined) service.priority         = patch.priority;

  return res.status(200).json({ success: true, message: 'Service updated', service });
});

// ── DELETE /api/services/:id ─────────────────────────────────────────────────
// Delete a service and its queue
router.delete('/:id', (req, res) => {
  const id  = parseInt(req.params.id, 10);
  const idx = store.services.findIndex(s => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  store.services.splice(idx, 1);
  delete store.queues[id];

  return res.status(200).json({ success: true, message: 'Service deleted' });
});

module.exports = router;

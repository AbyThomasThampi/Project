// routes/services.js
// Service Management Module: create, read, update, delete services
const { requireAdmin } = require('../middleware/authz');
const express = require('express');
const router  = express.Router();
const store   = require('../store/dataStore');
const { validateService, validate } = require('../middleware/validate');

// ── GET /api/services ────────────────────────────────────────────────────────
// List all services
router.get('/', async (req, res) => {
  const services = await store.getServices();
  return res.status(200).json({ success: true, services });
});

// ── GET /api/services/:id ────────────────────────────────────────────────────
// Get a single service by ID
router.get('/:id', async (req, res) => {
  const id      = parseInt(req.params.id, 10);
  const service = await store.getServiceById(id);

  if (!service) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }

  return res.status(200).json({ success: true, service });
});

// ── POST /api/services ───────────────────────────────────────────────────────
// Create a new service
// Body: { name, description, expectedDuration, priority? }
router.post('/', requireAdmin, validate(validateService), async (req, res) => {
  const { name, description, expectedDuration, priority = 'medium' } = req.body;

  const newService = await store.createService({
    name:             name.trim(),
    description:      description.trim(),
    expectedDuration: parseInt(expectedDuration, 10),
    priority
  });

  return res.status(201).json({
    success: true,
    message: 'Service created',
    service: newService
  });
});

// ── PUT /api/services/:id ────────────────────────────────────────────────────
// Update an existing service
// Body: { name?, description?, expectedDuration?, priority? }
router.put('/:id',requireAdmin, async (req, res) => {
  const id      = parseInt(req.params.id, 10);
  
  const existing = await store.getServiceById(id);
  if (!existing) {
    return res.status(404).json({ success: false, errors: ['Service not found'] })
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

  const updated = await store.updateService(id, {
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.description !== undefined && { description: patch.description.trim() }),
    ...(patch.expectedDuration !== undefined && { expectedDuration: parseInt(patch.expectedDuration, 10) }),
    ...(patch.priority !== undefined && { priority: patch.priority })
  });
  
  return res.status(200).json({ success: true, message: 'Service updated', service: updated });
});

// ── DELETE /api/services/:id ─────────────────────────────────────────────────
// Delete a service and its queue
router.delete('/:id',requireAdmin, async (req, res) => {
  const id  = parseInt(req.params.id, 10);
  
  const existing = await store.getServiceById(id);
  if (!existing) {
    return res.status(404).json({ success: false, errors: ['Service not found'] });
  }
  
  await store.deleteService(id);

  return res.status(200).json({ success: true, message: 'Service deleted' });
});

module.exports = router;

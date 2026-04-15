// routes/notifications.js
// Notification Module — create, fetch, mark read, clear

const express = require('express');
const router  = express.Router();
const store   = require('../store/dataStore');

// ── Internal helper (called from queue.js) ────────────────────────────────────
function createNotification(userEmail, type, title, message, serviceId = null) {
  const validTypes = ['info', 'success', 'warning', 'alert'];
  const notif = {
    id:        store.nextNotifId(),
    userEmail: userEmail.toLowerCase(),
    type:      validTypes.includes(type) ? type : 'info',
    title:     String(title).substring(0, 200),
    message:   String(message).substring(0, 500),
    serviceId,
    timestamp: new Date().toISOString(),
    read:      false
  };

  store.notifications.push(notif);

  // Cap at 200 total notifications (oldest removed first)
  if (store.notifications.length > 200) {
    store.notifications.shift();
  }

  return notif;
}

// ── POST /api/notifications ───────────────────────────────────────────────────
// Manually create a notification (admin broadcast)
// Body: { userEmail, type, title, message, serviceId? }
router.post('/', (req, res) => {
  const { userEmail, type, title, message, serviceId } = req.body;
  const errors = [];

  if (!userEmail || typeof userEmail !== 'string') errors.push("'userEmail' is required");
  if (!title     || typeof title     !== 'string') errors.push("'title' is required");
  if (!message   || typeof message   !== 'string') errors.push("'message' is required");

  if (errors.length) return res.status(400).json({ success: false, errors });

  const notif = createNotification(userEmail.trim(), type || 'info', title.trim(), message.trim(), serviceId || null);
  return res.status(201).json({ success: true, notification: notif });
});

// ── GET /api/notifications/:email ─────────────────────────────────────────────
// Get unread notifications for a user (newest first, limit via ?limit=N)
router.get('/:email', (req, res) => {
  const email = req.params.email.toLowerCase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

  const userNotifs = store.notifications
    .filter(n => n.userEmail === email && !n.read)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);

  return res.status(200).json({
    success: true,
    count:         userNotifs.length,
    notifications: userNotifs
  });
});

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────
// Mark a single notification as read
router.patch('/:id/read', (req, res) => {
  const id    = parseInt(req.params.id, 10);
  const notif = store.notifications.find(n => n.id === id);

  if (!notif) {
    return res.status(404).json({ success: false, errors: ['Notification not found'] });
  }

  notif.read = true;
  return res.status(200).json({ success: true, message: 'Notification marked as read' });
});

// ── DELETE /api/notifications/:email ─────────────────────────────────────────
// Clear all notifications for a user (admin use)
router.delete('/:email', (req, res) => {
  const email  = req.params.email.toLowerCase();
  const before = store.notifications.length;

  store.notifications = store.notifications.filter(n => n.userEmail !== email);
  const removed = before - store.notifications.length;

  return res.status(200).json({ success: true, message: `Cleared ${removed} notifications` });
});

module.exports = router;
module.exports.createNotification = createNotification;

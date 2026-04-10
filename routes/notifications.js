const express = require('express');
const router  = express.Router();
const store   = require('../store/dataStore');

async function createNotification(userEmail, type, title, message, serviceId = null) {
  const validTypes = ['info', 'success', 'warning', 'alert'];

  const notif = await store.createNotification({
    userEmail: userEmail.toLowerCase(),
    type: validTypes.includes(type) ? type : 'info',
    title: String(title).substring(0, 200),
    message: String(message).substring(0, 500),
    serviceId
  });

  return notif;
}

router.post('/', async (req, res) => {
  const { userEmail, type, title, message, serviceId } = req.body;
  const errors = [];

  if (!userEmail || typeof userEmail !== 'string') errors.push("'userEmail' is required");
  if (!title || typeof title !== 'string') errors.push("'title' is required");
  if (!message || typeof message !== 'string') errors.push("'message' is required");

  if (errors.length) {
    return res.status(400).json({ success: false, errors });
  }

  const notif = await createNotification(
    userEmail.trim(),
    type || 'info',
    title.trim(),
    message.trim(),
    serviceId || null
  );

  return res.status(201).json({ success: true, notification: notif });
});

router.get('/:email', async (req, res) => {
  const email = req.params.email.toLowerCase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

  const notifications = await store.getUnreadNotifications(email, limit);

  return res.status(200).json({
    success: true,
    count: notifications.length,
    notifications
  });
});

router.patch('/:id/read', async (req, res) => {
  const id = parseInt(req.params.id, 10);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, errors: ['Invalid notification id'] });
  }

  const affectedRows = await store.markNotificationRead(id);

  if (!affectedRows) {
    return res.status(404).json({ success: false, errors: ['Notification not found'] });
  }

  return res.status(200).json({
    success: true,
    message: 'Notification marked as read'
  });
});

router.delete('/:email', async (req, res) => {
  const email = req.params.email.toLowerCase();

  await store.clearNotifications(email);

  return res.status(200).json({
    success: true,
    message: 'Notifications cleared'
  });
});

module.exports = router;
module.exports.createNotification = createNotification;
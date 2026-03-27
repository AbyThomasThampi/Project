// server.js
// QueueSmart Express API Server

const express  = require('express');
const cors     = require('cors');

const authRouter          = require('./routes/auth');
const servicesRouter      = require('./routes/services');
const queueRouter         = require('./routes/queue');
const notificationsRouter = require('./routes/notifications');
const historyRouter       = require('./routes/history');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());                        // Allow frontend on same or different port
app.use(express.json());                // Parse JSON request bodies
app.use(express.static('public'));      // Serve frontend files (A2 HTML/CSS/JS)

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRouter);
app.use('/api/services',      servicesRouter);
app.use('/api/queue',         queueRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/history',       historyRouter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'QueueSmart API is running', timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, errors: [`Route not found: ${req.method} ${req.path}`] });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, errors: ['Internal server error'] });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`QueueSmart API running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;   // exported for supertest

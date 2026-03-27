// store/dataStore.js
// In-memory data store for QueueSmart (Assignment 3 - no DB required)
// All data resets when server restarts; persistence added in A4.

const store = {
  // ── Users ────────────────────────────────────────────────────────────────
  users: [
    { id: 1, email: "student@tutor.com", password: "student123", role: "user" },
    { id: 2, email: "admin@tutor.com",   password: "admin123",   role: "admin" }
  ],

  // ── Services ─────────────────────────────────────────────────────────────
  services: [
    { id: 1, name: "Algebra Tutoring", description: "One-on-one help with algebra",    expectedDuration: 45, priority: "medium" },
    { id: 2, name: "Essay Review",     description: "Detailed feedback on essays",      expectedDuration: 30, priority: "low"    },
    { id: 3, name: "Calculus Help",    description: "Calculus 1 & 2 support",           expectedDuration: 60, priority: "high"   }
  ],

  // ── Queues ── keyed by serviceId ─────────────────────────────────────────
  // Each entry: { email, joinedAt, priority }
  queues: { 1: [], 2: [], 3: [] },

  // ── Notifications ─────────────────────────────────────────────────────────
  notifications: [],

  // ── History ───────────────────────────────────────────────────────────────
  history: [],

  // ── ID counters ───────────────────────────────────────────────────────────
  _nextUserId:    3,
  _nextServiceId: 4,
  _nextNotifId:   1,
  _nextHistoryId: 1,

  // ── Helpers ───────────────────────────────────────────────────────────────
  nextUserId()    { return this._nextUserId++;    },
  nextServiceId() { return this._nextServiceId++; },
  nextNotifId()   { return this._nextNotifId++;   },
  nextHistoryId() { return this._nextHistoryId++; }
};

module.exports = store;

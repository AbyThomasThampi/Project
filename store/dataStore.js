// store/dataStore.js
// MySQL data store (Added for Assignment 4)

const db = require('./db');

const store = {
  // ── Users ────────────────────────────────────────────────────────────────
  
  //Old in-memory users store
  //users: [
  //  { id: 1, email: "student@tutor.com", password: "student123", role: "user" },
  //  { id: 2, email: "admin@tutor.com",   password: "admin123",   role: "admin" }
  //],
  
  // New MySQL users functions
  async listUsers() {
    const [rows] = await db.execute('SELECT * FROM users');
    return rows;
  },
  
  async getUserByEmail(email) {
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0];
  },

  async addUser({ email, password, role }) {
    const [result] = await db.execute(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      [email, password, role]
    );
    return { id: result.insertId, email, role };
  },

  // ── Services ─────────────────────────────────────────────────────────────

  // Old in-memory services stores
  //services: [
  //  { id: 1, name: "Algebra Tutoring", description: "One-on-one help with algebra",    expectedDuration: 45, priority: "medium" },
  //  { id: 2, name: "Essay Review",     description: "Detailed feedback on essays",      expectedDuration: 30, priority: "low"    },
  //  { id: 3, name: "Calculus Help",    description: "Calculus 1 & 2 support",           expectedDuration: 60, priority: "high"   }
  //],

  // New MySQL db services functions
  async getServices() {
    const [rows] = await db.execute('SELECT * FROM services');
    return rows;
  },

  async getServiceById(id) {
    const [rows] = await db.execute(
      'SELECT * FROM services WHERE id = ?',
      [id]
    );

    return rows[0];
  },

  async createService(service) {
    const { name, description, expectedDuration, priority } = service;

    const [result] = await db.execute(
      `INSERT INTO services (name, description, expectedDuration, priority)
      VALUES (?, ?, ?, ?)`,
      [name, description, expectedDuration, priority]
    );

    return { id: result.insertId, ...service };
  },

  async updateService(id, updates) {
    const fields = Object.keys(updates)
    .map(key => `${key} = ?`)
    .join(', ');
  
    const values = Object.values(updates);

    await db.execute(
      `UPDATE services SET ${fields} WHERE id = ?`,
      [...values, id]
    );

    return this.getServiceById(id);
  },

  async deleteService(id) {
      await db.execute('DELETE FROM services WHERE id = ?', [id]);
  },
  
  // ── Queues ── keyed by serviceId ─────────────────────────────────────────
  
  // Old in-memory queues stores
  // Each entry: { email, joinedAt, priority }
  // queues: { 1: [], 2: [], 3: [] },

  // New MySQL db queues functions
  async getQueue(serviceId) {
    const [rows] = await db.execute(
      `SELECT * FROM queue
      WHERE serviceId = ?
      ORDER BY joinedAt ASC`,
      [serviceId]
    );
    return rows;
  },

  async joinQueue(serviceId, { email, priority }) {
    await db.execute(
      `INSERT INTO queue (serviceId, email, priority, joinedAt)
      VALUES (?, ?, ?, NOW())`,
      [serviceId, email, priority || 'medium']
    );
  },

  async leaveQueue(serviceId, email) {
    await db.execute(
      `DELETE FROM queue WHERE serviceId = ? AND email = ?`,
      [serviceId, email]
    );
  },

  async serveNext(serviceId) {
    const [rows] = await db.execute(
      `SELECT * FROM queue
      WHERE serviceId = ?
      ORDER BY joinedAt ASC
      LIMIT 1`,
      [serviceId]
    );

    const next = rows[0];
    if (!next) return null;

    await this.leaveQueue(serviceId, next.email);
    return next;
  },

  async updateQueuePriority(serviceId, email, priority) {
    await db.execute(
      `UPDATE queue SET priority = ?
      WHERE serviceId = ? AND email = ?`,
      [priority, serviceId, email]
    );
  },

  async reorderQueue(serviceId, fromIndex, toIndex) {
    // minimal placeholder for now
    // change later
    return this.getQueue(serviceId);
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  
  // Old in-memory notifications store
  //notifications: [],

  // New MySQL db notifications functions
  async createNotification({ userEmail, type, title, message }) {
    const [result] = await db.execute(
      `INSERT INTO notifications (userEmail, type, title, message, isRead)
      VALUES (?, ?, ?, ?, false)`,
      [userEmail, type, title, message]
    );

    return { id: result.insertId };
  },

  async getUnreadNotifications(email, limit = 10) {
    if (!email) throw new Error('email is required');

    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10)); // between 1 and 100

    const query = `
      SELECT * FROM notifications
      WHERE userEmail = ? AND isRead = false
      LIMIT ${safeLimit}  -- inject directly
    `;

    const [rows] = await db.execute(query, [email]);
    return rows;
  },

  async markNotificationRead(id) {
    await db.execute(
      `UPDATE notifications SET isRead = true WHERE id = ?`,
      [id]
    );
  },

  async clearNotifications(email) {
    await db.execute(
      `DELETE FROM notifications WHERE userEmail = ?`,
      [email]
    );
  },

  // ── History ───────────────────────────────────────────────────────────────
  
  // Old in-memory history store
  //history: [],

  // New MySQL db history functions
  async getHistory(email) {
    const [rows] = await db.execute(
      `SELECT * FROM history WHERE email = ?`,
      [email]
    );
    return rows;
  },

  async addHistory(entry) {
    const { email, serviceId, status, joinedAt } = entry;

    const [serviceRow] = await db.execute(
      `SELECT name FROM services WHERE id = ?`,
      [serviceId]
    );
    const serviceName = serviceRow[0].name;

    // Use joinedAt if provided, else NOW()
    const joinTime = joinedAt || new Date();

    // completedAt should be NOW() if leaving or served
    const completeTime = (status === 'served' || status === 'left') ? new Date() : null;

    await db.execute(
      `INSERT INTO history (email, serviceId, serviceName, status, joinedAt, completedAt)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [email, serviceId, serviceName, status, joinTime, completeTime]
    );
  },

  async clearHistory(email) {
    await db.execute(
      `DELETE FROM history WHERE email = ?`,
      [email]
    );
  }  

  // ── ID counters ───────────────────────────────────────────────────────────
  // _nextUserId:    3,
  // _nextServiceId: 4,
  // _nextNotifId:   1,
  // _nextHistoryId: 1,

  // ── Helpers ───────────────────────────────────────────────────────────────
  // nextUserId()    { return this._nextUserId++;    },
  // nextServiceId() { return this._nextServiceId++; },
  // nextNotifId()   { return this._nextNotifId++;   },
  // nextHistoryId() { return this._nextHistoryId++; }
};

module.exports = store;

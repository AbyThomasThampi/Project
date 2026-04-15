// tests/queuesmart.test.js
// QueueSmart Backend — Unit Tests (Jest + Supertest)
// Covers: Auth, Services, Queue, Notifications, History, Validation

const request = require('supertest');
const app     = require('../server');
const store   = require('../store/dataStore');
const { validateEmail, validatePassword, validateService } = require('../middleware/validate');
const { calculateWait } = require('../routes/queue');

// ─── Reset store before each test to ensure isolation ────────────────────────
beforeEach(() => {
  store.users = [
    { id: 1, email: 'student@tutor.com', password: 'student123', role: 'user'  },
    { id: 2, email: 'admin@tutor.com',   password: 'admin123',   role: 'admin' }
  ];
  store.services = [
    { id: 1, name: 'Algebra Tutoring', description: 'One-on-one help with algebra', expectedDuration: 45, priority: 'medium' },
    { id: 2, name: 'Essay Review',     description: 'Detailed feedback on essays',  expectedDuration: 30, priority: 'low'    },
    { id: 3, name: 'Calculus Help',    description: 'Calculus 1 & 2 support',       expectedDuration: 60, priority: 'high'   }
  ];
  store.queues        = { 1: [], 2: [], 3: [] };
  store.notifications = [];
  store.history       = [];
  store._nextUserId    = 3;
  store._nextServiceId = 4;
  store._nextNotifId   = 1;
  store._nextHistoryId = 1;
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Validation Helpers', () => {
  describe('validateEmail()', () => {
    test('accepts a valid email', () => {
      expect(validateEmail('user@example.com')).toBeNull();
    });
    test('rejects missing @ symbol', () => {
      expect(validateEmail('notanemail')).toBeTruthy();
    });
    test('rejects non-string input', () => {
      expect(validateEmail(123)).toBeTruthy();
    });
    test('rejects email over 254 characters', () => {
      const long = 'a'.repeat(250) + '@b.com';
      expect(validateEmail(long)).toBeTruthy();
    });
  });

  describe('validatePassword()', () => {
    test('accepts a valid password', () => {
      expect(validatePassword('secure123')).toBeNull();
    });
    test('rejects password shorter than 6 characters', () => {
      expect(validatePassword('abc')).toBeTruthy();
    });
    test('rejects non-string input', () => {
      expect(validatePassword(12345678)).toBeTruthy();
    });
    test('rejects password over 128 characters', () => {
      expect(validatePassword('a'.repeat(129))).toBeTruthy();
    });
  });

  describe('validateService()', () => {
    const valid = { name: 'Math Help', description: 'Help with math', expectedDuration: 30 };

    test('passes with valid data', () => {
      expect(validateService(valid)).toHaveLength(0);
    });
    test('fails when name is missing', () => {
      const errors = validateService({ ...valid, name: '' });
      expect(errors.length).toBeGreaterThan(0);
    });
    test('fails when duration is below 5', () => {
      const errors = validateService({ ...valid, expectedDuration: 3 });
      expect(errors.length).toBeGreaterThan(0);
    });
    test('fails when priority is invalid', () => {
      const errors = validateService({ ...valid, priority: 'urgent' });
      expect(errors.length).toBeGreaterThan(0);
    });
    test('fails when name exceeds 100 characters', () => {
      const errors = validateService({ ...valid, name: 'a'.repeat(101) });
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — WAIT-TIME CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Wait-Time Estimation Logic', () => {
  test('returns position × service duration for known service', () => {
    expect(calculateWait(1, 1)).toBe(45);
    expect(calculateWait(1, 3)).toBe(135);
  });

  test('defaults to 30 minutes per position for unknown service', () => {
    expect(calculateWait(999, 2)).toBe(60);
  });

  test('returns 0 for position 0', () => {
    expect(calculateWait(1, 0)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — AUTH MODULE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Auth Module — POST /api/auth/register', () => {
  test('registers a new user successfully', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: 'newstudent@test.com', password: 'password1' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('user');
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ password: 'password1' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 for invalid email format', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: 'bademail', password: 'password1' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for short password', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: 'test@test.com', password: 'abc' });
    expect(res.status).toBe(400);
  });

  test('returns 409 when email already registered', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: 'student@tutor.com', password: 'password1' });
    expect(res.status).toBe(409);
  });

  test('assigns admin role when specified', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ email: 'newadmin@test.com', password: 'password1', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
  });
});

describe('Auth Module — POST /api/auth/login', () => {
  test('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'student@tutor.com', password: 'student123' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('user');
  });

  test('returns 401 for wrong password', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'student@tutor.com', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  test('returns 400 when fields are missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('returns 401 for unregistered email', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'ghost@test.com', password: 'password1' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — SERVICE MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Service Module — GET /api/services', () => {
  test('returns all seeded services', async () => {
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(3);
  });
});

describe('Service Module — GET /api/services/:id', () => {
  test('returns the correct service by ID', async () => {
    const res = await request(app).get('/api/services/1');
    expect(res.status).toBe(200);
    expect(res.body.service.name).toBe('Algebra Tutoring');
  });

  test('returns 404 for unknown service', async () => {
    const res = await request(app).get('/api/services/999');
    expect(res.status).toBe(404);
  });
});

describe('Service Module — POST /api/services', () => {
  const validService = { name: 'Python Help', description: 'Python tutoring', expectedDuration: 45 };

  test('creates a new service', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('x-user-email', 'admin@tutor.com')
      .send(validService);
    expect(res.status).toBe(201);
    expect(res.body.service.name).toBe('Python Help');
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('x-user-email', 'admin@tutor.com')
      .send({ description: 'desc', expectedDuration: 30 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when duration < 5', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('x-user-email', 'admin@tutor.com')
      .send({ ...validService, expectedDuration: 2 });
    expect(res.status).toBe(400);
  });

  test('defaults priority to medium when not provided', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('x-user-email', 'admin@tutor.com')
      .send(validService);
    expect(res.body.service.priority).toBe('medium');
  });
});

describe('Service Module — PUT /api/services/:id', () => {
  test('updates a service name', async () => {
    const res = await request(app)
      .put('/api/services/1')
      .set('x-user-email', 'admin@tutor.com')
      .send({ name: 'Advanced Algebra' });
    expect(res.status).toBe(200);
    expect(res.body.service.name).toBe('Advanced Algebra');
  });

  test('returns 404 for unknown service', async () => {
    const res = await request(app)
      .put('/api/services/999')
      .set('x-user-email', 'admin@tutor.com')
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid priority', async () => {
    const res = await request(app)
      .put('/api/services/1')
      .set('x-user-email', 'admin@tutor.com')
      .send({ priority: 'critical' });
    expect(res.status).toBe(400);
  });
});

describe('Service Module — DELETE /api/services/:id', () => {
  test('deletes a service', async () => {
    const res = await request(app)
      .delete('/api/services/1')
      .set('x-user-email', 'admin@tutor.com');
    expect(res.status).toBe(200);
    const all = await request(app).get('/api/services');
    expect(all.body.services).toHaveLength(2);
  });

  test('returns 404 for unknown service', async () => {
    const res = await request(app)
      .delete('/api/services/999')
      .set('x-user-email', 'admin@tutor.com');
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — QUEUE MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Queue Module — Join', () => {
  test('user joins queue successfully', async () => {
    const res = await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });
    expect(res.status).toBe(201);
    expect(res.body.position).toBe(1);
    expect(res.body.estimatedWait).toBe(45);
  });

  test('returns 409 if user already in queue', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    const res = await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    expect(res.status).toBe(409);
  });

  test('returns 404 for unknown service', async () => {
    const res = await request(app).post('/api/queue/999/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });
    expect(res.status).toBe(404);
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid email format', async () => {
    const res = await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('second user gets position 2', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'a@test.com')
      .send({ email: 'a@test.com' });

    const res = await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'b@test.com')
      .send({ email: 'b@test.com' });

    expect(res.body.position).toBe(2);
  });
});

describe('Queue Module — View', () => {
  test('returns queue with annotated positions', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    const res = await request(app)
      .get('/api/queue/1')
      .set('x-user-email', 'admin@tutor.com');

    expect(res.status).toBe(200);
    expect(res.body.queue[0].position).toBe(1);
    expect(res.body.queue[0].estimatedWait).toBe(45);
  });

  test('returns 404 for unknown service', async () => {
    const res = await request(app)
      .get('/api/queue/999')
      .set('x-user-email', 'admin@tutor.com');
    expect(res.status).toBe(404);
  });

  test('returns empty queue correctly', async () => {
    const res = await request(app)
      .get('/api/queue/1')
      .set('x-user-email', 'admin@tutor.com');
    expect(res.status).toBe(200);
    expect(res.body.queue).toHaveLength(0);
  });
});

describe('Queue Module — Leave', () => {
  test('user leaves queue successfully', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    const res = await request(app).delete('/api/queue/1/leave')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    expect(res.status).toBe(200);

    const q = await request(app)
      .get('/api/queue/1')
      .set('x-user-email', 'admin@tutor.com');

    expect(q.body.queueLength).toBe(0);
  });

  test('returns 404 if user not in queue', async () => {
    const res = await request(app).delete('/api/queue/1/leave')
      .set('x-user-email', 'ghost@test.com')
      .send({ email: 'ghost@test.com' });
    expect(res.status).toBe(404);
  });
});

describe('Queue Module — Serve Next', () => {
  test('serves first user in queue', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'first@test.com')
      .send({ email: 'first@test.com' });

    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'second@test.com')
      .send({ email: 'second@test.com' });

    const res = await request(app)
      .post('/api/queue/1/serve')
      .set('x-user-email', 'admin@tutor.com');

    expect(res.status).toBe(200);
    expect(res.body.served.email).toBe('first@test.com');
    expect(res.body.remainingQueue).toBe(1);
  });

  test('returns 400 when queue is empty', async () => {
    const res = await request(app)
      .post('/api/queue/1/serve')
      .set('x-user-email', 'admin@tutor.com');
    expect(res.status).toBe(400);
  });

  test('records history entry after serving', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'first@test.com')
      .send({ email: 'first@test.com' });

    await request(app)
      .post('/api/queue/1/serve')
      .set('x-user-email', 'admin@tutor.com');

    expect(store.history).toHaveLength(1);
    expect(store.history[0].status).toBe('served');
  });
});

describe('Queue Module — Priority & Reorder', () => {
  beforeEach(async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'a@test.com')
      .send({ email: 'a@test.com' });

    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'b@test.com')
      .send({ email: 'b@test.com' });
  });

  test('changes user priority', async () => {
    const res = await request(app)
      .patch('/api/queue/1/priority')
      .set('x-user-email', 'admin@tutor.com')
      .send({ email: 'a@test.com', priority: 'high' });

    expect(res.status).toBe(200);
    expect(res.body.entry.priority).toBe('high');
  });

  test('returns 400 for invalid priority', async () => {
    const res = await request(app)
      .patch('/api/queue/1/priority')
      .set('x-user-email', 'admin@tutor.com')
      .send({ email: 'a@test.com', priority: 'critical' });

    expect(res.status).toBe(400);
  });

  test('reorders queue entries', async () => {
    const res = await request(app)
      .patch('/api/queue/1/reorder')
      .set('x-user-email', 'admin@tutor.com')
      .send({ fromIndex: 0, toIndex: 1 });

    expect(res.status).toBe(200);
    expect(res.body.queue[0].email).toBe('b@test.com');
  });

  test('returns 400 for out-of-bounds reorder index', async () => {
    const res = await request(app)
      .patch('/api/queue/1/reorder')
      .set('x-user-email', 'admin@tutor.com')
      .send({ fromIndex: 0, toIndex: 99 });

    expect(res.status).toBe(400);
  });
});

describe('Queue Module — Wait Time Endpoint', () => {
  test('returns 0-position wait for empty queue', async () => {
    const res = await request(app)
      .get('/api/queue/1/wait')
      .set('x-user-email', 'student@tutor.com');

    expect(res.status).toBe(200);
    expect(res.body.estimatedWait).toBe(45);
  });

  test('increases wait after user joins', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'u@test.com')
      .send({ email: 'u@test.com' });

    const res = await request(app)
      .get('/api/queue/1/wait')
      .set('x-user-email', 'u@test.com');

    expect(res.body.estimatedWait).toBe(90);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — NOTIFICATION MODULE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Notification Module', () => {
  test('creates notification via POST', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('x-user-email', 'admin@tutor.com')
      .send({
        userEmail: 'student@tutor.com',
        type: 'info',
        title: 'Test Alert',
        message: 'This is a test'
      });
    expect(res.status).toBe(201);
    expect(res.body.notification.title).toBe('Test Alert');
  });

  test('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('x-user-email', 'admin@tutor.com')
      .send({ type: 'info' });
    expect(res.status).toBe(400);
  });

  test('fetches unread notifications for user', async () => {
    await request(app)
      .post('/api/notifications')
      .set('x-user-email', 'admin@tutor.com')
      .send({
        userEmail: 'student@tutor.com', type: 'info', title: 'A', message: 'B'
      });

    const res = await request(app)
      .get('/api/notifications/student@tutor.com')
      .set('x-user-email', 'student@tutor.com');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  test('marks notification as read', async () => {
    await request(app)
      .post('/api/notifications')
      .set('x-user-email', 'admin@tutor.com')
      .send({
        userEmail: 'student@tutor.com', type: 'info', title: 'A', message: 'B'
      });

    const patchRes = await request(app).patch('/api/notifications/1/read');
    expect(patchRes.status).toBe(200);

    const getRes = await request(app)
      .get('/api/notifications/student@tutor.com')
      .set('x-user-email', 'student@tutor.com');

    expect(getRes.body.count).toBe(0);
  });

  test('returns 404 for unknown notification ID', async () => {
    const res = await request(app).patch('/api/notifications/999/read');
    expect(res.status).toBe(404);
  });

  test('clears all notifications for user', async () => {
    await request(app)
      .post('/api/notifications')
      .set('x-user-email', 'admin@tutor.com')
      .send({
        userEmail: 'student@tutor.com', type: 'info', title: 'A', message: 'B'
      });

    const delRes = await request(app)
      .delete('/api/notifications/student@tutor.com')
      .set('x-user-email', 'student@tutor.com');

    expect(delRes.status).toBe(200);

    const getRes = await request(app)
      .get('/api/notifications/student@tutor.com')
      .set('x-user-email', 'student@tutor.com');

    expect(getRes.body.count).toBe(0);
  });

  test('auto-creates notification when user joins queue', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    const res = await request(app)
      .get('/api/notifications/student@tutor.com')
      .set('x-user-email', 'student@tutor.com');

    expect(res.body.count).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — HISTORY MODULE
// ═══════════════════════════════════════════════════════════════════════════════
describe('History Module', () => {
  test('returns empty history for new user', async () => {
    const res = await request(app).get('/api/history/student@tutor.com');
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(0);
  });

  test('records history when user is served', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    await request(app)
      .post('/api/queue/1/serve')
      .set('x-user-email', 'admin@tutor.com');

    const res = await request(app).get('/api/history/student@tutor.com');
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].status).toBe('served');
  });

  test('records history when user leaves queue', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    await request(app).delete('/api/queue/1/leave')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    const res = await request(app).get('/api/history/student@tutor.com');
    expect(res.body.history[0].status).toBe('left');
  });

  test('returns stats for user with history', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    await request(app)
      .post('/api/queue/1/serve')
      .set('x-user-email', 'admin@tutor.com');

    const res = await request(app).get('/api/history/student@tutor.com/stats');
    expect(res.status).toBe(200);
    expect(res.body.stats.totalVisits).toBe(1);
    expect(res.body.stats.completedVisits).toBe(1);
    expect(res.body.stats.mostUsedService).toBe('Algebra Tutoring');
  });

  test('returns empty stats for user with no history', async () => {
    const res = await request(app).get('/api/history/nobody@test.com/stats');
    expect(res.status).toBe(200);
    expect(res.body.stats.totalVisits).toBe(0);
  });

  test('filters history by status', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    await request(app)
      .post('/api/queue/1/serve')
      .set('x-user-email', 'admin@tutor.com');

    const res = await request(app).get('/api/history/student@tutor.com?status=served');
    expect(res.body.history[0].status).toBe('served');
  });

  test('returns 400 for invalid status filter', async () => {
    const res = await request(app).get('/api/history/student@tutor.com?status=unknown');
    expect(res.status).toBe(400);
  });

  test('admin can clear user history', async () => {
    await request(app).post('/api/queue/1/join')
      .set('x-user-email', 'student@tutor.com')
      .send({ email: 'student@tutor.com' });

    await request(app)
      .post('/api/queue/1/serve')
      .set('x-user-email', 'admin@tutor.com');

    await request(app)
      .delete('/api/history/student@tutor.com')
      .set('x-user-email', 'admin@tutor.com');

    const res = await request(app).get('/api/history/student@tutor.com');
    expect(res.body.history).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — AUTHORIZATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Authorization', () => {
  test('blocks student from creating a service', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('x-user-email', 'student@tutor.com')
      .send({
        name: 'Physics Help',
        description: 'Lab support',
        expectedDuration: 30
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('blocks requests with no user header on admin route', async () => {
    const res = await request(app)
      .post('/api/queue/1/serve');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — HEALTH CHECK & 404
// ═══════════════════════════════════════════════════════════════════════════════
describe('Server Health & Routing', () => {
  test('GET /api/health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('unknown route returns 404', async () => {
    const res = await request(app).get('/api/doesnotexist');
    expect(res.status).toBe(404);
  });
});

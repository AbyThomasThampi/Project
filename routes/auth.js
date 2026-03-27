// routes/auth.js
// Authentication module: registration, login, role handling

const express = require('express');
const router  = express.Router();
const store   = require('../store/dataStore');
const { validateEmail, validatePassword } = require('../middleware/validate');

// ── POST /api/auth/register ──────────────────────────────────────────────────
// Body: { email, password, role? }   role defaults to 'user'
router.post('/register', (req, res) => {
  const { email, password, role } = req.body;
  const errors = [];

  // Required-field checks
  if (!email)    errors.push("'email' is required");
  if (!password) errors.push("'password' is required");
  if (errors.length) return res.status(400).json({ success: false, errors });

  // Format / length checks
  const emailErr = validateEmail(email);
  if (emailErr) errors.push(emailErr);

  const passErr = validatePassword(password);
  if (passErr) errors.push(passErr);

  // Role validation
  const allowedRoles = ['user', 'admin'];
  const assignedRole = role && allowedRoles.includes(role) ? role : 'user';

  if (errors.length) return res.status(400).json({ success: false, errors });

  // Duplicate check
  const normalEmail = email.trim().toLowerCase();
  if (store.users.find(u => u.email === normalEmail)) {
    return res.status(409).json({ success: false, errors: ['Email already registered'] });
  }

  // Create user
  const newUser = {
    id:       store.nextUserId(),
    email:    normalEmail,
    password,           // plain-text for A3; hash in A4+
    role:     assignedRole
  };
  store.users.push(newUser);

  return res.status(201).json({
    success: true,
    message: 'Account created successfully',
    user: { id: newUser.id, email: newUser.email, role: newUser.role }
  });
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
// Body: { email, password }
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email)    errors.push("'email' is required");
  if (!password) errors.push("'password' is required");
  if (errors.length) return res.status(400).json({ success: false, errors });

  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ success: false, errors: [emailErr] });

  const normalEmail = email.trim().toLowerCase();
  const user = store.users.find(u => u.email === normalEmail && u.password === password);

  if (!user) {
    return res.status(401).json({ success: false, errors: ['Invalid email or password'] });
  }

  return res.status(200).json({
    success: true,
    message: 'Login successful',
    user: { id: user.id, email: user.email, role: user.role }
  });
});

// ── GET /api/auth/users ──────────────────────────────────────────────────────
// Returns all users (admin use; passwords stripped)
router.get('/users', (req, res) => {
  const safeUsers = store.users.map(({ password, ...u }) => u);
  return res.status(200).json({ success: true, users: safeUsers });
});

module.exports = router;

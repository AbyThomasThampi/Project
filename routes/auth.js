const express = require('express');
const bcrypt = require('bcryptjs');
const router  = express.Router();
const store   = require('../store/dataStore');
const { validateEmail, validatePassword } = require('../middleware/validate');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, role } = req.body;
  const errors = [];

  if (!email) errors.push("'email' is required");
  if (!password) errors.push("'password' is required");
  if (errors.length) return res.status(400).json({ success: false, errors });

  const emailErr = validateEmail(email);
  if (emailErr) errors.push(emailErr);

  const passErr = validatePassword(password);
  if (passErr) errors.push(passErr);

  const allowedRoles = ['user', 'admin'];
  const assignedRole = role && allowedRoles.includes(role) ? role : 'user';

  if (errors.length) return res.status(400).json({ success: false, errors });

  const normalEmail = email.trim().toLowerCase();
  const existingUser = await store.getUserByEmail(normalEmail);
  if (existingUser) {
    return res.status(409).json({ success: false, errors: ['Email already registered'] });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await store.addUser({
    email: normalEmail,
    password: hashedPassword,
    role: assignedRole
  });

  return res.status(201).json({
    success: true,
    message: 'Account created successfully',
    user: { id: newUser.id, email: newUser.email, role: newUser.role }
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email) errors.push("'email' is required");
  if (!password) errors.push("'password' is required");
  if (errors.length) return res.status(400).json({ success: false, errors });

  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ success: false, errors: [emailErr] });

  const normalEmail = email.trim().toLowerCase();
  const user = await store.getUserByEmail(normalEmail);

  if (!user) {
    return res.status(401).json({ success: false, errors: ['Invalid email or password'] });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    return res.status(401).json({ success: false, errors: ['Invalid email or password'] });
  }

  return res.status(200).json({
    success: true,
    message: 'Login successful',
    user: { id: user.id, email: user.email, role: user.role }
  });
});

// GET /api/auth/users
router.get('/users', async (req, res) => {
  const users = await store.listUsers();

  const safeUsers = users.map(({ password, ...u }) => u);

  return res.status(200).json({ success: true, users: safeUsers });
});

module.exports = router;

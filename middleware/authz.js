const store = require('../store/dataStore');

function getUserFromHeader(req) {
  const email = req.header('x-user-email');
  if (!email) return null;

  return store.users.find(
    user => user.email === String(email).trim().toLowerCase()
  ) || null;
}

function requireEmail(req, res, next) {
  const email = req.header('x-user-email');

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({
      success: false,
      errors: ['Missing or invalid x-user-email header']
    });
  }

  next();
}

function requireUser(req, res, next) {
  const user = getUserFromHeader(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      errors: ['Missing or invalid x-user-email header']
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  const user = getUserFromHeader(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      errors: ['Missing or invalid x-user-email header']
    });
  }

  if (user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      errors: ['Admin access required']
    });
  }

  next();
}

module.exports = { requireEmail, requireUser, requireAdmin };
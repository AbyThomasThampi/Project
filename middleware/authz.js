const store = require('../store/dataStore');

async function getUserFromHeader(req) {
  const email = req.header('x-user-email');
  if (!email || typeof email !== 'string' || !email.trim()) return null;

  return await store.getUserByEmail(String(email).trim().toLowerCase());
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

async function requireUser(req, res, next) {
  const user = await getUserFromHeader(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      errors: ['Missing or invalid x-user-email header']
    });
  }

  req.user = user;
  next();
}

async function requireAdmin(req, res, next) {
  const user = await getUserFromHeader(req);

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

  req.user = user;
  next();
}

module.exports = { requireEmail, requireUser, requireAdmin };
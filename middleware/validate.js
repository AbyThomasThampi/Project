// middleware/validate.js
// Reusable validation helpers returning { valid, errors }

/**
 * Check that all required keys exist and are non-empty strings/numbers.
 */
function requireFields(body, fields) {
  const errors = [];
  fields.forEach(f => {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      errors.push(`'${f}' is required`);
    }
  });
  return errors;
}

/**
 * Validate a single email string.
 */
function validateEmail(email) {
  if (typeof email !== 'string') return "email must be a string";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "email format is invalid";
  if (email.length > 254) return "email must be ≤ 254 characters";
  return null;
}

/**
 * Validate a password string.
 */
function validatePassword(password) {
  if (typeof password !== 'string') return "password must be a string";
  if (password.length < 6)  return "password must be at least 6 characters";
  if (password.length > 128) return "password must be ≤ 128 characters";
  return null;
}

/**
 * Validate service fields.
 */
function validateService(body) {
  const errors = [];
  const required = requireFields(body, ['name', 'description', 'expectedDuration']);
  errors.push(...required);

  if (!required.includes("'name' is required")) {
    if (typeof body.name !== 'string')       errors.push("name must be a string");
    else if (body.name.trim().length < 2)    errors.push("name must be at least 2 characters");
    else if (body.name.trim().length > 100)  errors.push("name must be ≤ 100 characters");
  }

  if (!required.includes("'description' is required")) {
    if (typeof body.description !== 'string')       errors.push("description must be a string");
    else if (body.description.trim().length > 500)  errors.push("description must be ≤ 500 characters");
  }

  if (!required.includes("'expectedDuration' is required")) {
    const dur = Number(body.expectedDuration);
    if (!Number.isInteger(dur) || dur < 5)  errors.push("expectedDuration must be an integer ≥ 5");
    if (dur > 480)                           errors.push("expectedDuration must be ≤ 480 minutes");
  }

  const validPriorities = ['low', 'medium', 'high'];
  if (body.priority && !validPriorities.includes(body.priority)) {
    errors.push(`priority must be one of: ${validPriorities.join(', ')}`);
  }

  return errors;
}

/**
 * Express middleware factory — validates request body and returns 400 on failure.
 * Usage: router.post('/route', validate(myValidator), handler)
 */
function validate(validatorFn) {
  return (req, res, next) => {
    const errors = validatorFn(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }
    next();
  };
}

module.exports = { requireFields, validateEmail, validatePassword, validateService, validate };

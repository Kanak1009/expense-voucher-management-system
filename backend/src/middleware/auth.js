const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// Verifies the Bearer token and loads the user from the DB (so deleted users lose access)
const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }

  const { rows } = await db.query(
    'SELECT id, name, email, role, employee_code, signature_url FROM users WHERE id = $1',
    [payload.sub]
  );
  if (!rows[0]) throw new AppError(401, 'User no longer exists');
  req.user = rows[0];
  next();
});

// Role-based access control
const authorize = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError(403, 'You do not have permission to perform this action'));
  }
  next();
};

module.exports = { authenticate, authorize };

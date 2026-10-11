const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { loginSchema } = require('../utils/validators');
const { toUrl, removeFile } = require('../middleware/upload');

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  employeeCode: u.employee_code, signatureUrl: u.signature_url,
});

// A dummy hash so login takes similar time whether or not the email exists
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { rows } = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'Invalid email or password');

  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  res.json({ token, user: publicUser(user) });
});

exports.me = (req, res) => res.json({ user: publicUser(req.user) });

// Save / replace the signature on the user's profile
exports.uploadSignature = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'Signature image is required');
  const old = req.user.signature_url;
  const { rows } = await db.query(
    'UPDATE users SET signature_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [toUrl(req.file), req.user.id]
  );
  removeFile(old);
  res.json({ user: publicUser(rows[0]) });
});

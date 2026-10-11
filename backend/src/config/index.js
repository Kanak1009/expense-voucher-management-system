require('dotenv').config({ quiet: true });
const path = require('path');

module.exports = {
  port: process.env.PORT || 5000,
  env: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev_only_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 2),
};

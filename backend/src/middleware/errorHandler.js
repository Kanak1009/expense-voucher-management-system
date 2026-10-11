const { ZodError } = require('zod');
const multer = require('multer');
const config = require('../config');

const notFound = (req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const errors = {};
    err.issues.forEach((i) => { errors[i.path.join('.') || '_'] = i.message; });
    return res.status(400).json({ message: 'Validation failed', errors });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? `Image must be smaller than ${config.maxUploadMb} MB` : err.message;
    return res.status(400).json({ message });
  }
  if (err.status) return res.status(err.status).json({ message: err.message, errors: err.details });
  if (err.code === '23505') return res.status(409).json({ message: 'Duplicate value' });
  if (err.code === '23514') return res.status(400).json({ message: 'Data violates a database rule' });

  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
};

module.exports = { notFound, errorHandler };

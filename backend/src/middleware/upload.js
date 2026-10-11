const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const AppError = require('../utils/AppError');

fs.mkdirSync(config.uploadDir, { recursive: true });

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg' };

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  // random name; extension derived from validated mimetype, never from the client filename
  filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${EXT[file.mimetype]}`),
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXT[file.mimetype]) return cb(new AppError(400, 'Only PNG or JPEG images are allowed'));
    cb(null, true);
  },
});

const toUrl = (file) => (file ? `/uploads/${file.filename}` : null);

const removeFile = (url) => {
  if (!url) return;
  fs.unlink(path.join(config.uploadDir, path.basename(url)), () => {});
};

module.exports = { signatureUpload: upload.single('signature'), toUrl, removeFile };

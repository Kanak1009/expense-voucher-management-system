const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { signatureUpload } = require('../middleware/upload');
const { ROLES } = require('../utils/constants');
const auth = require('../controllers/authController');
const vouchers = require('../controllers/voucherController');
const dashboard = require('../controllers/dashboardController');

const { EMPLOYEE, DIRECTOR } = ROLES;

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Auth
router.post('/auth/login', auth.login);
router.get('/auth/me', authenticate, auth.me);
router.post('/users/me/signature', authenticate, signatureUpload, auth.uploadSignature);

// Everything below requires a logged-in user
router.use(authenticate);

router.get('/meta', vouchers.meta);
router.get('/dashboard', dashboard.get);

// Vouchers - reads (scoped by role inside the controller)
router.get('/vouchers', vouchers.list);
router.get('/vouchers/:id', vouchers.getOne);

// Vouchers - employee actions
router.post('/vouchers', authorize(EMPLOYEE), vouchers.create);
router.put('/vouchers/:id', authorize(EMPLOYEE), vouchers.update);
router.delete('/vouchers/:id', authorize(EMPLOYEE), vouchers.remove);
router.post('/vouchers/:id/signature', authorize(EMPLOYEE), signatureUpload, vouchers.uploadEmployeeSignature);
router.post('/vouchers/:id/submit', authorize(EMPLOYEE), vouchers.submit);

// Vouchers - director actions
router.post('/vouchers/:id/approve', authorize(DIRECTOR), signatureUpload, vouchers.approve);
router.post('/vouchers/:id/reject', authorize(DIRECTOR), vouchers.reject);

module.exports = router;

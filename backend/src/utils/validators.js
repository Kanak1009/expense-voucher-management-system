const { z } = require('zod');
const { CATEGORIES } = require('./constants');

const dateStr = (label) =>
  z.string({ required_error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date (YYYY-MM-DD)`)
    .refine((v) => !Number.isNaN(Date.parse(v)), `${label} must be a valid date`);

const today = () => new Date().toISOString().slice(0, 10);

const voucherSchema = z.object({
  department: z.string({ required_error: 'Department is required' }).trim().min(1, 'Department is required').max(100),
  title: z.string({ required_error: 'Expense title is required' }).trim().min(1, 'Expense title is required').max(200),
  expenseDate: dateStr('Expense date').refine((v) => v <= today(), 'Expense date cannot be in the future'),
  category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'Invalid expense category' }) }).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  amount: z.coerce
    .number({ required_error: 'Amount is required', invalid_type_error: 'Amount must be a number' })
    .gt(0, 'Amount must be greater than zero')
    .lt(1e10, 'Amount is too large')
    .refine((v) => Math.round(v * 100) / 100 === v, 'Amount can have at most 2 decimal places'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

const rejectSchema = z.object({
  reason: z.string({ required_error: 'Rejection reason is required' }).trim().min(3, 'Rejection reason is required'),
});

module.exports = { voucherSchema, loginSchema, rejectSchema };

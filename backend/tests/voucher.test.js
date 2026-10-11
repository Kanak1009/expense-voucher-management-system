/**
 * Integration tests - run against a SEPARATE database (TEST_DATABASE_URL).
 * Create it first:  createdb expense_vouchers_test
 */
require('dotenv').config({ quiet: true });
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.UPLOAD_DIR = 'uploads/test';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/config/db');

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const PASSWORD = 'Password@123';
let tokens = {};

const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.token;
const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
const validVoucher = (over = {}) => ({
  department: 'Engineering', title: 'Client visit cab', category: 'Travel',
  expenseDate: '2026-01-10', amount: 1250.5, description: 'Cab to client office', ...over,
});

const createDraft = async (over) =>
  (await request(app).post('/api/vouchers').set(as('emp1')).send(validVoucher(over))).body.voucher;
const attachSig = (id) =>
  request(app).post(`/api/vouchers/${id}/signature`).set(as('emp1')).attach('signature', PNG, 'sig.png');
const submit = async (id) => { await attachSig(id); return request(app).post(`/api/vouchers/${id}/submit`).set(as('emp1')); };

beforeAll(async () => {
  await db.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  await db.query('TRUNCATE voucher_status_history, vouchers, users RESTART IDENTITY CASCADE');
  const hash = await bcrypt.hash(PASSWORD, 4);
  const users = [['Dir', 'dir@t.com', 'DIRECTOR'], ['Acc', 'acc@t.com', 'ACCOUNTS'], ['Emp One', 'e1@t.com', 'EMPLOYEE'], ['Emp Two', 'e2@t.com', 'EMPLOYEE']];
  for (const [n, e, r] of users) await db.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4)', [n, e, hash, r]);
  tokens = { dir: await login('dir@t.com'), acc: await login('acc@t.com'), emp1: await login('e1@t.com'), emp2: await login('e2@t.com') };
});

afterAll(async () => {
  fs.rmSync(path.resolve('uploads/test'), { recursive: true, force: true });
  await db.pool.end();
});

describe('Authentication', () => {
  test('rejects bad credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'e1@t.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });
  test('protected routes require a token', async () => {
    expect((await request(app).get('/api/vouchers')).status).toBe(401);
    expect((await request(app).get('/api/vouchers').set('Authorization', 'Bearer junk')).status).toBe(401);
  });
});

describe('Validation', () => {
  test.each([
    ['missing department', { department: '' }],
    ['missing title', { title: '' }],
    ['missing expense date', { expenseDate: undefined }],
    ['missing amount', { amount: undefined }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -5 }],
  ])('create fails: %s', async (_n, over) => {
    const res = await request(app).post('/api/vouchers').set(as('emp1')).send(validVoucher(over));
    expect(res.status).toBe(400);
  });
});

describe('Employee workflow', () => {
  test('creates a DRAFT with an auto-generated unique voucher number', async () => {
    const a = await createDraft();
    const b = await createDraft();
    expect(a.status).toBe('DRAFT');
    expect(a.voucherNumber).toMatch(/^VCH-\d{4}-\d{5}$/);
    expect(a.voucherNumber).not.toBe(b.voucherNumber);
  });

  test('cannot submit without a signature', async () => {
    const v = await createDraft();
    const res = await request(app).post(`/api/vouchers/${v.id}/submit`).set(as('emp1'));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/signature/i);
  });

  test('can edit and delete while in draft', async () => {
    const v = await createDraft();
    const upd = await request(app).put(`/api/vouchers/${v.id}`).set(as('emp1')).send(validVoucher({ title: 'Edited' }));
    expect(upd.status).toBe(200);
    expect(upd.body.voucher.title).toBe('Edited');
    expect((await request(app).delete(`/api/vouchers/${v.id}`).set(as('emp1'))).status).toBe(200);
  });

  test('submitted voucher becomes read-only for the employee', async () => {
    const v = await createDraft();
    const res = await submit(v.id);
    expect(res.status).toBe(200);
    expect(res.body.voucher.status).toBe('PENDING_APPROVAL');
    expect((await request(app).put(`/api/vouchers/${v.id}`).set(as('emp1')).send(validVoucher())).status).toBe(409);
    expect((await request(app).delete(`/api/vouchers/${v.id}`).set(as('emp1'))).status).toBe(409);
    expect((await request(app).post(`/api/vouchers/${v.id}/submit`).set(as('emp1'))).status).toBe(409);
  });

  test("employee cannot see another employee's voucher", async () => {
    const v = await createDraft();
    expect((await request(app).get(`/api/vouchers/${v.id}`).set(as('emp2'))).status).toBe(404);
    expect((await request(app).put(`/api/vouchers/${v.id}`).set(as('emp2')).send(validVoucher())).status).toBe(404);
    const list = await request(app).get('/api/vouchers').set(as('emp2'));
    expect(list.body.data.find((x) => x.id === v.id)).toBeUndefined();
  });

  test('rejects non-image uploads', async () => {
    const v = await createDraft();
    const res = await request(app).post(`/api/vouchers/${v.id}/signature`).set(as('emp1')).attach('signature', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});

describe('Director approval', () => {
  test('cannot approve without a signature, then approves with one', async () => {
    const v = await createDraft();
    await submit(v.id);
    const noSig = await request(app).post(`/api/vouchers/${v.id}/approve`).set(as('dir'));
    expect(noSig.status).toBe(400);
    const ok = await request(app).post(`/api/vouchers/${v.id}/approve`).set(as('dir')).attach('signature', PNG, 'dir.png');
    expect(ok.status).toBe(200);
    expect(ok.body.voucher.status).toBe('APPROVED');
    expect(ok.body.voucher.director.signatureUrl).toMatch(/^\/uploads\//);
    expect(ok.body.voucher.approvalDate).toBeTruthy();
  });

  test('approved voucher is read-only and cannot be re-reviewed', async () => {
    const v = await createDraft();
    await submit(v.id);
    await request(app).post(`/api/vouchers/${v.id}/approve`).set(as('dir')).attach('signature', PNG, 'd.png');
    expect((await request(app).put(`/api/vouchers/${v.id}`).set(as('emp1')).send(validVoucher())).status).toBe(409);
    expect((await request(app).post(`/api/vouchers/${v.id}/reject`).set(as('dir')).send({ reason: 'too late' })).status).toBe(409);
  });

  test('rejection requires a reason, employee can read it', async () => {
    const v = await createDraft();
    await submit(v.id);
    expect((await request(app).post(`/api/vouchers/${v.id}/reject`).set(as('dir')).send({})).status).toBe(400);
    const rej = await request(app).post(`/api/vouchers/${v.id}/reject`).set(as('dir')).send({ reason: 'Receipt missing' });
    expect(rej.status).toBe(200);
    expect(rej.body.voucher.status).toBe('REJECTED');
    const seen = await request(app).get(`/api/vouchers/${v.id}`).set(as('emp1'));
    expect(seen.body.voucher.rejectionReason).toBe('Receipt missing');
  });

  test('cannot approve a draft; employees & accounts cannot approve', async () => {
    const draft = await createDraft();
    expect((await request(app).post(`/api/vouchers/${draft.id}/approve`).set(as('dir')).attach('signature', PNG, 'd.png')).status).toBe(404);
    const v = await createDraft();
    await submit(v.id);
    expect((await request(app).post(`/api/vouchers/${v.id}/approve`).set(as('emp1')).attach('signature', PNG, 'd.png')).status).toBe(403);
    expect((await request(app).post(`/api/vouchers/${v.id}/approve`).set(as('acc')).attach('signature', PNG, 'd.png')).status).toBe(403);
    expect((await request(app).post(`/api/vouchers/${v.id}/reject`).set(as('acc')).send({ reason: 'nope nope' })).status).toBe(403);
  });
});

describe('Accounts & Director visibility', () => {
  test('accounts is read-only', async () => {
    expect((await request(app).post('/api/vouchers').set(as('acc')).send(validVoucher())).status).toBe(403);
    const v = await createDraft();
    await submit(v.id);
    expect((await request(app).put(`/api/vouchers/${v.id}`).set(as('acc')).send(validVoucher())).status).toBe(403);
    expect((await request(app).delete(`/api/vouchers/${v.id}`).set(as('acc'))).status).toBe(403);
    expect((await request(app).put(`/api/vouchers/${v.id}`).set(as('dir')).send(validVoucher())).status).toBe(403);
  });

  test('director and accounts see all submitted vouchers but not drafts', async () => {
    const draft = await createDraft({ title: 'PRIVATE DRAFT' });
    for (const r of ['dir', 'acc']) {
      const list = await request(app).get('/api/vouchers?limit=100').set(as(r));
      expect(list.status).toBe(200);
      expect(list.body.data.every((x) => x.status !== 'DRAFT')).toBe(true);
      expect((await request(app).get(`/api/vouchers/${draft.id}`).set(as(r))).status).toBe(404);
    }
  });

  test('search, filter and sort', async () => {
    const v = await createDraft({ title: 'Unique Zebra Trip', amount: 777, department: 'Sales' });
    await submit(v.id);
    const res = await request(app).get('/api/vouchers?search=zebra&department=Sales&minAmount=700&maxAmount=800&status=PENDING_APPROVAL').set(as('acc'));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Unique Zebra Trip');
    const byEmp = await request(app).get('/api/vouchers?employeeName=Emp%20One&sortBy=amount&order=asc').set(as('dir'));
    const amounts = byEmp.body.data.map((x) => x.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
    // sort param is whitelisted - injection attempt must not break the query
    expect((await request(app).get('/api/vouchers?sortBy=amount;DROP TABLE users').set(as('dir'))).status).toBe(200);
  });
});

describe('Dashboards', () => {
  test('return role-specific stats', async () => {
    const emp = await request(app).get('/api/dashboard').set(as('emp1'));
    expect(emp.body.stats).toEqual(expect.objectContaining({ totalVouchers: expect.any(Number), draftVouchers: expect.any(Number), totalAmountClaimed: expect.any(Number) }));
    const dir = await request(app).get('/api/dashboard').set(as('dir'));
    expect(dir.body.stats).toEqual(expect.objectContaining({ pendingApprovalCount: expect.any(Number), approvedToday: expect.any(Number), rejectedToday: expect.any(Number), totalPendingAmount: expect.any(Number) }));
    expect(dir.body.stats.approvedToday).toBeGreaterThan(0);
    const acc = await request(app).get('/api/dashboard').set(as('acc'));
    expect(acc.body.stats).toEqual(expect.objectContaining({ totalApprovedAmount: expect.any(Number), approvedVouchers: expect.any(Number) }));
    expect(acc.body.recent.length).toBeGreaterThan(0);
  });
});

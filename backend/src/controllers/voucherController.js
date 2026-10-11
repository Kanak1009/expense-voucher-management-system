const db = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { STATUS, ROLES, CATEGORIES, DEPARTMENTS } = require('../utils/constants');
const { voucherSchema, rejectSchema } = require('../utils/validators');
const { toUrl, removeFile } = require('../middleware/upload');

const BASE_SELECT = `
  SELECT v.*, e.name AS employee_name, e.employee_code AS employee_code, d.name AS director_name
  FROM vouchers v
  JOIN users e ON e.id = v.created_by
  LEFT JOIN users d ON d.id = v.reviewed_by`;

const serialize = (r) => ({
  id: r.id,
  voucherNumber: r.voucher_number,
  voucherDate: r.voucher_date,
  expenseDate: r.expense_date,
  department: r.department,
  title: r.title,
  category: r.category,
  description: r.description,
  amount: r.amount,
  status: r.status,
  employee: { id: r.created_by, name: r.employee_name, employeeCode: r.employee_code, signatureUrl: r.employee_signature_url },
  director: r.reviewed_by ? { id: r.reviewed_by, name: r.director_name, signatureUrl: r.director_signature_url } : null,
  submittedAt: r.submitted_at,
  approvalDate: r.approval_date,
  rejectedAt: r.rejected_at,
  rejectionReason: r.rejection_reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// Who may see what:
//  - Employee: only their own vouchers (any status)
//  - Director / Accounts: every voucher that has been submitted (drafts are private to the employee)
const visibility = (user, params, alias = 'v') => {
  if (user.role === ROLES.EMPLOYEE) {
    params.push(user.id);
    return `${alias}.created_by = $${params.length}`;
  }
  return `${alias}.status <> 'DRAFT'`;
};

// Loads a voucher the caller is allowed to see, or throws 404 (never leaks existence)
async function loadVisible(id, user, client = db, lock = false) {
  if (!/^\d+$/.test(String(id))) throw new AppError(404, 'Voucher not found');
  const params = [id];
  const vis = visibility(user, params);
  const { rows } = await client.query(`${BASE_SELECT} WHERE v.id = $1 AND ${vis} ${lock ? 'FOR UPDATE OF v' : ''}`, params);
  if (!rows[0]) throw new AppError(404, 'Voucher not found');
  return rows[0];
}

const addHistory = (client, voucherId, from, to, userId, remarks = null) =>
  client.query(
    'INSERT INTO voucher_status_history (voucher_id, from_status, to_status, changed_by, remarks) VALUES ($1,$2,$3,$4,$5)',
    [voucherId, from, to, userId, remarks]
  );

const assertOwnerDraft = (row, user, action) => {
  if (row.created_by !== user.id) throw new AppError(404, 'Voucher not found');
  if (row.status !== STATUS.DRAFT) throw new AppError(409, `Only Draft vouchers can be ${action}`);
};

// ---------- Employee ----------
exports.create = asyncHandler(async (req, res) => {
  const data = voucherSchema.parse(req.body);
  const id = await db.withTransaction(async (client) => {
    const seq = await client.query("SELECT nextval('voucher_number_seq') AS n");
    const number = `VCH-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(5, '0')}`;
    const { rows } = await client.query(
      `INSERT INTO vouchers (voucher_number, expense_date, department, title, category, description, amount, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [number, data.expenseDate, data.department, data.title, data.category || null, data.description || null, data.amount, req.user.id]
    );
    await addHistory(client, rows[0].id, null, STATUS.DRAFT, req.user.id, 'Voucher created');
    return rows[0].id;
  });
  res.status(201).json({ voucher: serialize(await loadVisible(id, req.user)) });
});

exports.update = asyncHandler(async (req, res) => {
  const data = voucherSchema.parse(req.body);
  await db.withTransaction(async (client) => {
    const row = await loadVisible(req.params.id, req.user, client, true);
    assertOwnerDraft(row, req.user, 'edited');
    await client.query(
      `UPDATE vouchers SET expense_date=$1, department=$2, title=$3, category=$4, description=$5, amount=$6, updated_at=NOW()
       WHERE id=$7`,
      [data.expenseDate, data.department, data.title, data.category || null, data.description || null, data.amount, row.id]
    );
  });
  res.json({ voucher: serialize(await loadVisible(req.params.id, req.user)) });
});

exports.remove = asyncHandler(async (req, res) => {
  let sig;
  await db.withTransaction(async (client) => {
    const row = await loadVisible(req.params.id, req.user, client, true);
    assertOwnerDraft(row, req.user, 'deleted');
    sig = row.employee_signature_url;
    await client.query('DELETE FROM vouchers WHERE id = $1', [row.id]);
  });
  removeFile(sig);
  res.json({ message: 'Voucher deleted' });
});

// Attach / replace the employee signature on a Draft voucher
exports.uploadEmployeeSignature = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'Signature image is required');
  let old;
  try {
    await db.withTransaction(async (client) => {
      const row = await loadVisible(req.params.id, req.user, client, true);
      assertOwnerDraft(row, req.user, 'modified');
      old = row.employee_signature_url;
      await client.query('UPDATE vouchers SET employee_signature_url=$1, updated_at=NOW() WHERE id=$2', [toUrl(req.file), row.id]);
    });
  } catch (err) {
    removeFile(toUrl(req.file));
    throw err;
  }
  removeFile(old);
  res.json({ voucher: serialize(await loadVisible(req.params.id, req.user)) });
});

exports.submit = asyncHandler(async (req, res) => {
  await db.withTransaction(async (client) => {
    const row = await loadVisible(req.params.id, req.user, client, true);
    assertOwnerDraft(row, req.user, 'submitted');
    // voucher signature wins; otherwise fall back to the signature saved on the profile
    const signature = row.employee_signature_url || req.user.signature_url;
    if (!signature) throw new AppError(400, 'Employee signature is mandatory before submission', { signature: 'Employee signature is required' });
    await client.query(
      `UPDATE vouchers SET status=$1, employee_signature_url=$2, submitted_at=NOW(), updated_at=NOW() WHERE id=$3`,
      [STATUS.PENDING, signature, row.id]
    );
    await addHistory(client, row.id, STATUS.DRAFT, STATUS.PENDING, req.user.id, 'Submitted for approval');
  });
  res.json({ voucher: serialize(await loadVisible(req.params.id, req.user)) });
});

// ---------- Director ----------
exports.approve = asyncHandler(async (req, res) => {
  let uploaded = req.file ? toUrl(req.file) : null;
  try {
    await db.withTransaction(async (client) => {
      const row = await loadVisible(req.params.id, req.user, client, true);
      if (row.status !== STATUS.PENDING) throw new AppError(409, 'Only vouchers pending approval can be approved');
      const signature = uploaded || req.user.signature_url;
      if (!signature) throw new AppError(400, 'Director signature is mandatory before approval', { signature: 'Director signature is required' });
      await client.query(
        `UPDATE vouchers SET status=$1, reviewed_by=$2, director_signature_url=$3, approval_date=NOW(), updated_at=NOW() WHERE id=$4`,
        [STATUS.APPROVED, req.user.id, signature, row.id]
      );
      await addHistory(client, row.id, STATUS.PENDING, STATUS.APPROVED, req.user.id, 'Approved');
    });
  } catch (err) {
    removeFile(uploaded);
    throw err;
  }
  res.json({ voucher: serialize(await loadVisible(req.params.id, req.user)) });
});

exports.reject = asyncHandler(async (req, res) => {
  const { reason } = rejectSchema.parse(req.body);
  await db.withTransaction(async (client) => {
    const row = await loadVisible(req.params.id, req.user, client, true);
    if (row.status !== STATUS.PENDING) throw new AppError(409, 'Only vouchers pending approval can be rejected');
    await client.query(
      `UPDATE vouchers SET status=$1, reviewed_by=$2, rejection_reason=$3, rejected_at=NOW(), updated_at=NOW() WHERE id=$4`,
      [STATUS.REJECTED, req.user.id, reason, row.id]
    );
    await addHistory(client, row.id, STATUS.PENDING, STATUS.REJECTED, req.user.id, reason);
  });
  res.json({ voucher: serialize(await loadVisible(req.params.id, req.user)) });
});

// ---------- Shared reads ----------
const SORTABLE = {
  voucherNumber: 'v.voucher_number',
  employeeName: 'e.name',
  department: 'v.department',
  category: 'v.category',
  expenseDate: 'v.expense_date',
  voucherDate: 'v.voucher_date',
  amount: 'v.amount',
  status: 'v.status',
  createdAt: 'v.created_at',
  updatedAt: 'v.updated_at',
};

exports.list = asyncHandler(async (req, res) => {
  const q = req.query;
  const params = [];
  const where = [visibility(req.user, params)];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };

  if (q.search) {
    params.push(`%${String(q.search).trim()}%`);
    where.push(`(v.voucher_number ILIKE $${params.length} OR e.name ILIKE $${params.length} OR v.title ILIKE $${params.length})`);
  }
  if (q.voucherNumber) add('v.voucher_number ILIKE ?', `%${q.voucherNumber}%`);
  if (q.employeeName) add('e.name ILIKE ?', `%${q.employeeName}%`);
  if (q.department) add('v.department = ?', q.department);
  if (q.category) add('v.category = ?', q.category);
  if (q.status) {
    if (!Object.values(STATUS).includes(q.status)) throw new AppError(400, 'Invalid status filter');
    add('v.status = ?', q.status);
  }
  if (q.dateFrom) add('v.expense_date >= ?', q.dateFrom);
  if (q.dateTo) add('v.expense_date <= ?', q.dateTo);
  if (q.minAmount !== undefined && q.minAmount !== '') add('v.amount >= ?', Number(q.minAmount));
  if (q.maxAmount !== undefined && q.maxAmount !== '') add('v.amount <= ?', Number(q.maxAmount));

  // whitelist => no SQL injection through sort params
  const sortCol = SORTABLE[q.sortBy] || SORTABLE.createdAt;
  const order = String(q.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 10, 1), 100);

  const whereSql = where.join(' AND ');
  const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM vouchers v JOIN users e ON e.id=v.created_by WHERE ${whereSql}`, params);
  const dataRes = await db.query(
    `${BASE_SELECT} WHERE ${whereSql} ORDER BY ${sortCol} ${order}, v.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    params
  );
  const total = countRes.rows[0].total;
  res.json({
    data: dataRes.rows.map(serialize),
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
});

exports.getOne = asyncHandler(async (req, res) => {
  const row = await loadVisible(req.params.id, req.user);
  const history = await db.query(
    `SELECT h.from_status, h.to_status, h.remarks, h.changed_at, u.name AS changed_by
     FROM voucher_status_history h JOIN users u ON u.id = h.changed_by
     WHERE h.voucher_id = $1 ORDER BY h.changed_at, h.id`,
    [row.id]
  );
  res.json({
    voucher: serialize(row),
    history: history.rows.map((h) => ({
      fromStatus: h.from_status, toStatus: h.to_status, remarks: h.remarks, changedAt: h.changed_at, changedBy: h.changed_by,
    })),
  });
});

exports.meta = (_req, res) => res.json({ categories: CATEGORIES, departments: DEPARTMENTS, statuses: Object.values(STATUS) });

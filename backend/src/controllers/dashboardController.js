const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../utils/constants');

const row = (r) => ({
  id: r.id, voucherNumber: r.voucher_number, title: r.title, amount: r.amount, status: r.status,
  employeeName: r.employee_name, updatedAt: r.updated_at, activityAt: r.activity_at,
});

const RECENT = `SELECT v.id, v.voucher_number, v.title, v.amount, v.status, v.updated_at, e.name AS employee_name`;

exports.get = asyncHandler(async (req, res) => {
  const { role, id } = req.user;

  if (role === ROLES.EMPLOYEE) {
    const s = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status='DRAFT')::int AS draft,
              COUNT(*) FILTER (WHERE status='PENDING_APPROVAL')::int AS pending,
              COUNT(*) FILTER (WHERE status='APPROVED')::int AS approved,
              COUNT(*) FILTER (WHERE status='REJECTED')::int AS rejected,
              COALESCE(SUM(amount) FILTER (WHERE status <> 'DRAFT'), 0) AS claimed
       FROM vouchers WHERE created_by = $1`, [id]);
    const recent = await db.query(
      `${RECENT} FROM vouchers v JOIN users e ON e.id=v.created_by WHERE v.created_by=$1 ORDER BY v.updated_at DESC LIMIT 5`, [id]);
    const r = s.rows[0];
    return res.json({
      role,
      stats: { totalVouchers: r.total, draftVouchers: r.draft, pendingApproval: r.pending, approvedVouchers: r.approved, rejectedVouchers: r.rejected, totalAmountClaimed: r.claimed },
      recent: recent.rows.map(row),
    });
  }

  if (role === ROLES.DIRECTOR) {
    const s = await db.query(
      `SELECT COUNT(*) FILTER (WHERE status='PENDING_APPROVAL')::int AS pending,
              COUNT(*) FILTER (WHERE status='APPROVED' AND approval_date::date = CURRENT_DATE)::int AS approved_today,
              COUNT(*) FILTER (WHERE status='REJECTED' AND rejected_at::date = CURRENT_DATE)::int AS rejected_today,
              COALESCE(SUM(amount) FILTER (WHERE status='PENDING_APPROVAL'), 0) AS pending_amount
       FROM vouchers`);
    // Recent activity = latest status changes on submitted vouchers
    const recent = await db.query(
      `${RECENT}, h.changed_at AS activity_at
       FROM voucher_status_history h
       JOIN vouchers v ON v.id = h.voucher_id JOIN users e ON e.id = v.created_by
       WHERE h.to_status <> 'DRAFT' ORDER BY h.changed_at DESC, h.id DESC LIMIT 8`);
    const r = s.rows[0];
    return res.json({
      role,
      stats: { pendingApprovalCount: r.pending, approvedToday: r.approved_today, rejectedToday: r.rejected_today, totalPendingAmount: r.pending_amount },
      recent: recent.rows.map(row),
    });
  }

  // ACCOUNTS
  const s = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='PENDING_APPROVAL')::int AS pending,
            COUNT(*) FILTER (WHERE status='APPROVED')::int AS approved,
            COUNT(*) FILTER (WHERE status='REJECTED')::int AS rejected,
            COALESCE(SUM(amount) FILTER (WHERE status='APPROVED'), 0) AS approved_amount
     FROM vouchers WHERE status <> 'DRAFT'`);
  const recent = await db.query(
    `${RECENT}, v.approval_date AS activity_at FROM vouchers v JOIN users e ON e.id=v.created_by
     WHERE v.status='APPROVED' ORDER BY v.approval_date DESC LIMIT 8`);
  const r = s.rows[0];
  res.json({
    role,
    stats: { totalVouchers: r.total, pendingApproval: r.pending, approvedVouchers: r.approved, rejectedVouchers: r.rejected, totalApprovedAmount: r.approved_amount },
    recent: recent.rows.map(row),
  });
});

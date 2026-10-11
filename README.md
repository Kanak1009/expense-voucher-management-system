# Expense Voucher Management System

A full-stack web application that digitises the expense voucher process: **Employees** create and submit vouchers, the **Director** approves or rejects them (with signature / rejection reason), and the **Accounts Team** monitors everything for reimbursement.

| Layer | Technology |
|---|---|
| Frontend | React 18 (Vite), React Router (protected routes), Axios, plain responsive CSS |
| Backend | Node.js, Express, JWT auth, bcrypt, Multer (uploads), Zod (validation) |
| Database | PostgreSQL (`pg`, plain SQL migration) |
| Tests | Jest + Supertest (22 integration tests against a real test database) |

---

## 1. Features

- **Authentication** – JWT login, session restored on refresh, role-based route protection (frontend *and* backend).
- **Employee** – create voucher, save as Draft, edit/delete drafts, upload signature, submit, view own vouchers only, see rejection reason, dashboard.
- **Director** – dashboard, pending approvals, all vouchers, search/filter/sort, approve (signature mandatory), reject (reason mandatory). Cannot edit employee data.
- **Accounts** – dashboard, all vouchers (read-only), search/filter/sort, view both signatures, print / save as PDF.
- **Search, filter, sort, pagination** on voucher number, employee name, department, category, status, expense-date range, amount range.
- **Audit trail** – every status change is stored in `voucher_status_history` and shown on the voucher page.
- **Print-friendly voucher** (browser print → "Save as PDF").

## 2. Project setup

### Prerequisites
Node.js 18+ and PostgreSQL 13+.

### Steps

```bash
# 1. Create the databases
createdb expense_vouchers
createdb expense_vouchers_test        # only needed to run the tests

# 2. Backend
cd backend
cp .env.example .env                  # edit DATABASE_URL / JWT_SECRET if needed
npm install
npm run setup                         # runs db/schema.sql migration + seeds demo users
npm run dev                           # API on http://localhost:5000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                           # App on http://localhost:5173  (proxies /api and /uploads to :5000)
```

Run the tests: `cd backend && npm test`

Production build of the UI: `cd frontend && npm run build` (set `VITE_API_ORIGIN` if the API is on another origin, and set `CLIENT_URL` in the backend `.env` for CORS).

### Demo accounts (created by `npm run seed`) – password `Password@123`

| Role | Email |
|---|---|
| Director | director@abc.com |
| Accounts Team | accounts@abc.com |
| Employee | employee1@abc.com |
| Employee | employee2@abc.com |

### Environment variables (`backend/.env.example`)

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 5000) |
| `CLIENT_URL` | Allowed CORS origin |
| `DATABASE_URL` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | Separate DB used by `npm test` (it truncates tables!) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing secret / lifetime |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Where signatures are stored and the size limit |

## 3. Project structure

```
backend/
  db/schema.sql                 # migration (tables, enums, sequence, constraints, indexes)
  src/
    app.js / server.js          # Express app + entry point
    config/                     # env config, pg pool + transaction helper
    middleware/                 # auth (JWT + RBAC), upload (Multer), errorHandler
    controllers/                # auth, voucher (all business rules), dashboard
    routes/index.js             # route table with role guards
    utils/                      # constants, Zod validators, AppError
    scripts/                    # migrate.js, seed.js
  tests/voucher.test.js         # integration tests
frontend/src/
  pages/                        # Login, Dashboard, VoucherList, VoucherForm, VoucherDetail
  components/                   # Layout, ProtectedRoute, StatusBadge, SignatureUpload, StatCard, Modal, Pagination
  context/                      # AuthContext, ToastContext
```

## 4. Database schema

```
users (1) ────────< vouchers (1) ────────< voucher_status_history
  id PK               id PK                    id PK
  name                voucher_number UNIQUE    voucher_id FK -> vouchers
  email UNIQUE        voucher_date             from_status / to_status
  password_hash       expense_date             changed_by FK -> users
  role (enum)         department, title        remarks, changed_at
  employee_code       category, description
  signature_url       amount NUMERIC(12,2) > 0
                      status (enum)
                      created_by FK -> users          (the employee)
                      employee_signature_url, submitted_at
                      reviewed_by FK -> users         (the director)
                      director_signature_url, approval_date
                      rejected_at, rejection_reason
                      created_at, updated_at
```

**Key design points**

- `user_role` enum: `EMPLOYEE | DIRECTOR | ACCOUNTS`. `voucher_status` enum: `DRAFT | PENDING_APPROVAL | APPROVED | REJECTED`.
- **Voucher numbers** (`VCH-<year>-<5 digit>`) come from the Postgres sequence `voucher_number_seq` inside the insert transaction → automatic, unique and race-free. The `UNIQUE` constraint backs this up.
- **Database CHECK constraints** protect the business rules even if application code has a bug: `amount > 0`; a REJECTED voucher must have a reason; an APPROVED voucher must have a director signature; any non-draft voucher must have an employee signature.
- The employee signature URL is **copied onto the voucher at submit time**, so changing the profile signature later never alters past vouchers.
- Money is `NUMERIC(12,2)` (never floats).

## 5. Voucher workflow

```
DRAFT ──submit──▶ PENDING_APPROVAL ──approve──▶ APPROVED  (read-only, visible to Accounts)
                         │
                         └──────reject──────▶ REJECTED   (read-only, employee sees reason)
```

State changes run in a transaction with `SELECT … FOR UPDATE`, so two simultaneous approve/reject requests cannot both succeed.

## 6. API documentation

Base URL: `http://localhost:5000/api`. All endpoints except `login` and `health` need `Authorization: Bearer <token>`.
Errors are JSON: `{ "message": "...", "errors": { "field": "..." } }` with status 400 (validation), 401 (not logged in), 403 (wrong role), 404 (not found / not yours), 409 (invalid state, e.g. editing a submitted voucher).

### Auth
| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | public | Body `{email, password}` → `{token, user}` |
| GET | `/auth/me` | any | Current user |
| POST | `/users/me/signature` | any | multipart field `signature` (PNG/JPEG ≤ 2 MB). Saves a default signature on the profile |

### Vouchers
| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/vouchers` | Employee | Create (always `DRAFT`). Body: `department*, title*, expenseDate*, amount*, category, description` |
| GET | `/vouchers` | all | List. Employee → own only; Director/Accounts → all submitted. Query below |
| GET | `/vouchers/:id` | all | Detail + status history (same visibility rules) |
| PUT | `/vouchers/:id` | Employee (owner) | Edit – **Draft only** |
| DELETE | `/vouchers/:id` | Employee (owner) | Delete – **Draft only** |
| POST | `/vouchers/:id/signature` | Employee (owner) | multipart `signature`; attach employee signature to a Draft |
| POST | `/vouchers/:id/submit` | Employee (owner) | Draft → Pending Approval. Requires employee signature |
| POST | `/vouchers/:id/approve` | Director | multipart `signature` (or saved profile signature). Pending → Approved |
| POST | `/vouchers/:id/reject` | Director | Body `{reason}` (required). Pending → Rejected |
| GET | `/dashboard` | all | Role-specific statistics + recent items |
| GET | `/meta` | all | Categories, departments, statuses (for dropdowns) |

**`GET /vouchers` query parameters**

`search` (voucher no. / employee / title), `voucherNumber`, `employeeName`, `department`, `category`, `status`, `dateFrom`, `dateTo` (expense date, `YYYY-MM-DD`), `minAmount`, `maxAmount`, `sortBy` (`voucherNumber | employeeName | department | category | expenseDate | voucherDate | amount | status | createdAt | updatedAt`), `order` (`asc|desc`), `page`, `limit` (max 100).
Response: `{ data: [...], pagination: { page, limit, total, totalPages } }`.

**Dashboard payloads** – Employee: `totalVouchers, draftVouchers, pendingApproval, approvedVouchers, rejectedVouchers, totalAmountClaimed`. Director: `pendingApprovalCount, approvedToday, rejectedToday, totalPendingAmount` + recent activity. Accounts: `totalVouchers, pendingApproval, approvedVouchers, rejectedVouchers, totalApprovedAmount` + recent approved vouchers.

## 7. Security notes

- Passwords hashed with bcrypt; JWT verified on every request and the user is re-loaded from the DB.
- **Authorisation is enforced on the server** (route-level role guards + ownership filter in SQL). Other employees' vouchers return 404, not 403, so their existence is not leaked.
- All SQL is parameterised; sort columns are whitelisted.
- Uploads: PNG/JPEG only, size-limited, random server-generated filenames, extension derived from the validated MIME type.
- `helmet` headers, CORS restricted to `CLIENT_URL`, request body size limit.

## 8. Assumptions made

1. The PDF lists *Submitted* and *Pending Approval* as separate steps. Submitting immediately places the voucher in `PENDING_APPROVAL` (the submit moment is stored in `submitted_at` and in the history), so the stored statuses are Draft → Pending Approval → Approved/Rejected.
2. **Drafts are private to the employee.** Director and Accounts see every *submitted* voucher (pending, approved, rejected), not other people's unsubmitted drafts.
3. Accounts can see pending and rejected vouchers too (needed for their dashboard counts), and the UI shows which vouchers are approved and ready for reimbursement (status filter + badges).
4. The mandatory fields (department, title, expense date, amount > 0) are validated even when saving a Draft; the **signature** is only required at submission.
5. Expense date cannot be in the future. Amounts allow at most 2 decimals. Currency is displayed as INR (₹).
6. A user's signature can be uploaded per voucher, or saved once on their profile ("Save as my default signature") and reused. The employee signature is snapshotted onto the voucher at submit time.
7. "Total Amount Claimed" (employee dashboard) = sum of all non-draft vouchers. "Approved/Rejected Today" use the server's current date.
8. Users are provisioned by the seed script (no self-registration), as the brief describes fixed organisational roles.
9. Uploaded files are stored on local disk (`backend/uploads`); for production use S3/Cloudinary.
10. A rejected voucher stays rejected (read-only). The brief doesn't describe resubmission, so the employee creates a new voucher.
11. Download/print is implemented via the browser print dialog (Save as PDF) using print CSS.

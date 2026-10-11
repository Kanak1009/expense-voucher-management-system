-- Expense Voucher Management System : PostgreSQL schema
-- Run with:  npm run migrate   (or psql -f db/schema.sql)

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'DIRECTOR', 'ACCOUNTS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE voucher_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(120)  NOT NULL,
  email           VARCHAR(190)  NOT NULL UNIQUE,
  password_hash   VARCHAR(100)  NOT NULL,
  role            user_role     NOT NULL,
  employee_code   VARCHAR(30),
  signature_url   VARCHAR(255),              -- saved profile signature (optional)
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Voucher numbers come from this sequence => unique, auto-generated, race-free
CREATE SEQUENCE IF NOT EXISTS voucher_number_seq START 1;

CREATE TABLE IF NOT EXISTS vouchers (
  id                        SERIAL PRIMARY KEY,
  voucher_number            VARCHAR(30)    NOT NULL UNIQUE,
  voucher_date              DATE           NOT NULL DEFAULT CURRENT_DATE,
  expense_date              DATE           NOT NULL,
  department                VARCHAR(100)   NOT NULL,
  title                     VARCHAR(200)   NOT NULL,
  category                  VARCHAR(60),
  description               TEXT,
  amount                    NUMERIC(12,2)  NOT NULL CHECK (amount > 0),
  status                    voucher_status NOT NULL DEFAULT 'DRAFT',

  created_by                INTEGER        NOT NULL REFERENCES users(id),
  employee_signature_url    VARCHAR(255),
  submitted_at              TIMESTAMPTZ,

  reviewed_by               INTEGER        REFERENCES users(id),
  director_signature_url    VARCHAR(255),
  approval_date             TIMESTAMPTZ,
  rejected_at               TIMESTAMPTZ,
  rejection_reason          TEXT,

  created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  -- Data-level guards for the business rules
  CONSTRAINT chk_rejected_has_reason
    CHECK (status <> 'REJECTED' OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0)),
  CONSTRAINT chk_approved_has_signature
    CHECK (status <> 'APPROVED' OR director_signature_url IS NOT NULL),
  CONSTRAINT chk_submitted_has_signature
    CHECK (status = 'DRAFT' OR employee_signature_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_created_by ON vouchers(created_by);
CREATE INDEX IF NOT EXISTS idx_vouchers_status     ON vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_expense_dt ON vouchers(expense_date);
CREATE INDEX IF NOT EXISTS idx_vouchers_department ON vouchers(department);

-- Audit trail of every status change
CREATE TABLE IF NOT EXISTS voucher_status_history (
  id            SERIAL PRIMARY KEY,
  voucher_id    INTEGER        NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  from_status   voucher_status,
  to_status     voucher_status NOT NULL,
  changed_by    INTEGER        NOT NULL REFERENCES users(id),
  remarks       TEXT,
  changed_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_history_voucher ON voucher_status_history(voucher_id);

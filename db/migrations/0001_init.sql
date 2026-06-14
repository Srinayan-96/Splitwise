-- FlatSplit — initial migration
-- Run this once in Supabase SQL Editor (or any PostgreSQL instance)

CREATE TYPE split_type   AS ENUM ('equal', 'unequal', 'percentage', 'share');
CREATE TYPE log_severity AS ENUM ('INFO', 'WARNING', 'ERROR');

CREATE TABLE users (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL UNIQUE,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE groups (
  id         TEXT        PRIMARY KEY,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Tracks when each member joined and left.
-- leftAt NULL  → still active member.
-- This is what powers "Sam shouldn't share March expenses" logic.
CREATE TABLE group_members (
  id        TEXT        PRIMARY KEY,
  group_id  TEXT        NOT NULL REFERENCES groups(id),
  user_id   TEXT        NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL,
  left_at   TIMESTAMPTZ
);

-- amount is always in INR.
-- original_amount / original_currency / exchange_rate preserved for USD rows (Priya's requirement).
-- import_row_num links back to CSV row for full traceability (Rohan's requirement).
CREATE TABLE expenses (
  id                TEXT        PRIMARY KEY,
  group_id          TEXT        NOT NULL REFERENCES groups(id),
  description       TEXT        NOT NULL,
  date              TIMESTAMPTZ NOT NULL,
  amount            NUMERIC(12,2) NOT NULL,
  original_amount   NUMERIC(12,2),
  original_currency TEXT,
  exchange_rate     NUMERIC(10,4),
  split_type        split_type  NOT NULL,
  paid_by_id        TEXT        NOT NULL REFERENCES users(id),
  notes             TEXT,
  is_deleted        BOOLEAN     DEFAULT FALSE NOT NULL,
  import_row_num    INTEGER,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- One row per person per expense — the exact INR amount they owe.
-- This is the single source of truth for balance calculations.
CREATE TABLE expense_splits (
  id         TEXT          PRIMARY KEY,
  expense_id TEXT          NOT NULL REFERENCES expenses(id),
  user_id    TEXT          NOT NULL REFERENCES users(id),
  amount     NUMERIC(12,2) NOT NULL,
  UNIQUE(expense_id, user_id)
);

-- Explicit payment records — separate from expenses.
-- "Rohan paid Aisha back" becomes a Settlement, not an Expense.
CREATE TABLE settlements (
  id          TEXT          PRIMARY KEY,
  group_id    TEXT          NOT NULL REFERENCES groups(id),
  payer_id    TEXT          NOT NULL REFERENCES users(id),
  receiver_id TEXT          NOT NULL REFERENCES users(id),
  amount      NUMERIC(12,2) NOT NULL,
  date        TIMESTAMPTZ   NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

-- Every anomaly detected during CSV import.
-- approved = false → needs Meera's sign-off before the action is finalised.
CREATE TABLE import_logs (
  id           TEXT         PRIMARY KEY,
  imported_at  TIMESTAMPTZ  DEFAULT NOW() NOT NULL,
  row_num      INTEGER      NOT NULL,
  field        TEXT,
  issue        TEXT         NOT NULL,
  action       TEXT         NOT NULL,
  original_val TEXT,
  resolved_val TEXT,
  severity     log_severity NOT NULL,
  approved     BOOLEAN      DEFAULT TRUE NOT NULL
);

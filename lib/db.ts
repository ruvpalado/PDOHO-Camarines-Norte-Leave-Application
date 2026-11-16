import { sql } from '@vercel/postgres';

let schemaReady = false;

/**
 * Creates the leave_applications table if it doesn't exist yet.
 * Safe to call on every request - CREATE TABLE IF NOT EXISTS is a no-op
 * once the table exists, and we cache the result in-process to skip the
 * check on warm serverless invocations.
 */
export async function ensureSchema() {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS leave_applications (
      id SERIAL PRIMARY KEY,
      last_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      date_filed DATE,
      position TEXT,
      salary NUMERIC,
      leave_type TEXT NOT NULL,
      details_category TEXT,
      details_specify TEXT,
      facility_name TEXT,
      email TEXT,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days_applied NUMERIC NOT NULL,
      commutation TEXT DEFAULT 'Not Requested',
      attachment_filename TEXT,
      attachment_mimetype TEXT,
      attachment_data BYTEA,
      status TEXT NOT NULL DEFAULT 'pending',
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at TIMESTAMPTZ,
      decided_by TEXT,
      decision_note TEXT
    );
  `;
  // Safe to run even if the table already existed from a previous deploy -
  // adds each column only if it isn't there yet.
  await sql`ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS facility_name TEXT;`;
  await sql`ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS email TEXT;`;
  await sql`ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS attachment_filename TEXT;`;
  await sql`ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS attachment_mimetype TEXT;`;
  await sql`ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS attachment_data BYTEA;`;
  await sql`ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS employee_key TEXT;`;
  // Cancellation of a previously-approved leave: kept separate from decided_at/decided_by/
  // decision_note so the original approval record is preserved for audit purposes. Once
  // status is set to 'cancelled', it's automatically excluded from every "approved leave"
  // query (balance calculations, reports), which is what makes the leave credit revert.
  await sql`ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;`;
  await sql`ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS cancelled_by TEXT;`;
  await sql`ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS cancel_reason TEXT;`;

  // Opening leave-credit balances, set manually by an admin per employee (matched by
  // name) and per leave type. Available balance = opening_balance minus the sum of
  // approved applications of that type decided after set_at.
  await sql`
    CREATE TABLE IF NOT EXISTS leave_balances (
      id SERIAL PRIMARY KEY,
      last_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      employee_key TEXT NOT NULL,
      leave_type TEXT NOT NULL,
      opening_balance NUMERIC NOT NULL DEFAULT 0,
      set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by TEXT,
      UNIQUE (employee_key, leave_type)
    );
  `;

  // Backfill employee_key for any rows saved before this column existed.
  await sql`
    UPDATE leave_applications
    SET employee_key =
      regexp_replace(trim(lower(last_name)), '\\s+', ' ', 'g') || '|' ||
      regexp_replace(trim(lower(first_name)), '\\s+', ' ', 'g') || '|' ||
      regexp_replace(trim(lower(coalesce(middle_name, ''))), '\\s+', ' ', 'g')
    WHERE employee_key IS NULL;
  `;

  // Admin accounts (DB-backed so a password can actually be reset - the previous
  // ADMIN_USERNAME/ADMIN_PASSWORD env vars have no persistent record to update).
  await sql`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  // Single-use, time-limited password reset tokens (stored as a hash, never the raw token).
  await sql`
    CREATE TABLE IF NOT EXISTS admin_password_resets (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  // role distinguishes the developer/approver account from regular admins; status gates
  // login until a self-registered account has been approved by the developer.
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';`;
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';`;

  // Single-use, time-limited approve/reject tokens for self-registered admin accounts,
  // emailed to the developer/approver. No login required to click them.
  await sql`
    CREATE TABLE IF NOT EXISTS admin_registration_approvals (
      id SERIAL PRIMARY KEY,
      admin_user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      decided_at TIMESTAMPTZ,
      decision TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  // Deactivation/reactivation support: deactivated accounts may be reactivated within 90 days,
  // then are auto-deleted by the cleanup cron.
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;`;
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS deactivated_by TEXT;`;

  schemaReady = true;
}

import { sql } from '@vercel/postgres';
import { ensureSchema } from './db';

// DB-backed admin accounts + password reset tokens. Node-runtime only (uses
// @vercel/postgres) - never import this from middleware.ts.

const PBKDF2_ITERATIONS = 100000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REGISTRATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Every self-registered admin account is approved or rejected by this address.
// Overridable via env if the approver ever changes.
const APPROVER_EMAIL = process.env.ADMIN_APPROVER_EMAIL || 'ruvpalado@gmail.com';

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}

async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return toHex(bits);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(digest);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomHex(16);
  const hash = await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!Number.isFinite(iterations) || !salt || !expected) return false;
  const actual = await pbkdf2Hex(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Seeds admin_users from the legacy ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_EMAIL env
// vars the first time the table is empty, so existing admins keep working after
// this migration without any manual setup. Runs at most once per warm instance.
let seededPromise: Promise<void> | null = null;
async function ensureAdminUsersSeeded(): Promise<void> {
  if (!seededPromise) {
    seededPromise = (async () => {
      await ensureSchema();
      const existing = await sql`SELECT id FROM admin_users LIMIT 1;`;
      if (existing.rowCount === 0) {
        const envUser = process.env.ADMIN_USERNAME;
        const envPass = process.env.ADMIN_PASSWORD;
        const envEmail = process.env.ADMIN_EMAIL || null;
        if (envUser && envPass) {
          const passwordHash = await hashPassword(envPass);
          await sql`
            INSERT INTO admin_users (username, password_hash, email)
            VALUES (${envUser}, ${passwordHash}, ${envEmail})
            ON CONFLICT (username) DO NOTHING;
          `;
        }
      }

      // Seed the developer/approver account (ruvpalado@gmail.com) once, if it doesn't
      // exist yet. Its password_hash is a random value nobody knows - the account is
      // usable only after ruvpalado requests a password reset and sets a real password.
      const devExisting = await sql`SELECT id FROM admin_users WHERE username = 'ruvpalado' LIMIT 1;`;
      if (devExisting.rowCount === 0) {
        const placeholderHash = await hashPassword(randomHex(24));
        await sql`
          INSERT INTO admin_users (username, password_hash, email, role, status)
          VALUES ('ruvpalado', ${placeholderHash}, 'ruvpalado@gmail.com', 'developer', 'active')
          ON CONFLICT (username) DO NOTHING;
        `;
      }
    })();
  }
  return seededPromise;
}

export type LoginResult = 'ok' | 'invalid' | 'pending' | 'rejected' | 'deactivated';

export async function checkAdminCredentials(username: string, password: string): Promise<LoginResult> {
  if (!username || !password) return 'invalid';
  await ensureAdminUsersSeeded();
  const result = await sql`SELECT password_hash, status FROM admin_users WHERE username = ${username} LIMIT 1;`;
  if (result.rowCount === 0) return 'invalid';
  const row = result.rows[0] as { password_hash: string; status: string };
  const passOk = await verifyPassword(password, row.password_hash);
  if (!passOk) return 'invalid';
  if (row.status === 'pending') return 'pending';
  if (row.status === 'rejected') return 'rejected';
  if (row.status === 'deactivated') return 'deactivated';
  return 'ok';
}

export async function adminUsernameExists(username: string): Promise<boolean> {
  await ensureAdminUsersSeeded();
  const result = await sql`SELECT id FROM admin_users WHERE username = ${username} LIMIT 1;`;
  return result.rowCount > 0;
}

export async function getAdminEmailByUsername(username: string): Promise<string | null> {
  await ensureAdminUsersSeeded();
  const result = await sql`SELECT email FROM admin_users WHERE username = ${username} LIMIT 1;`;
  if (result.rowCount === 0) return null;
  return (result.rows[0].email as string | null) || null;
}

// Returns the raw (unhashed) token to email to the user; only its SHA-256 hash is stored.
export async function createPasswordResetToken(username: string): Promise<string> {
  await ensureAdminUsersSeeded();
  const rawToken = randomHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  await sql`
    INSERT INTO admin_password_resets (username, token_hash, expires_at)
    VALUES (${username}, ${tokenHash}, ${expiresAt});
  `;
  return rawToken;
}

export async function resetPasswordWithToken(
  username: string,
  rawToken: string,
  newPassword: string
): Promise<boolean> {
  await ensureAdminUsersSeeded();
  const tokenHash = await sha256Hex(rawToken);
  const result = await sql`
    SELECT id, expires_at, used_at FROM admin_password_resets
    WHERE username = ${username} AND token_hash = ${tokenHash}
    ORDER BY created_at DESC LIMIT 1;
  `;
  if (result.rowCount === 0) return false;
  const row = result.rows[0] as { id: number; expires_at: string; used_at: string | null };
  if (row.used_at) return false;
  if (new Date(row.expires_at) < new Date()) return false;

  const newHash = await hashPassword(newPassword);
  await sql`UPDATE admin_users SET password_hash = ${newHash}, updated_at = now() WHERE username = ${username};`;
  await sql`UPDATE admin_password_resets SET used_at = now() WHERE id = ${row.id};`;
  return true;
}

export function getApproverEmail(): string {
  return APPROVER_EMAIL;
}

// Creates a new admin account in 'pending' status - it cannot log in until the
// developer/approver clicks the Approve link that gets emailed to them.
export async function registerAdmin(
  username: string,
  password: string,
  email: string
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  await ensureAdminUsersSeeded();
  const existing = await sql`SELECT id FROM admin_users WHERE username = ${username} LIMIT 1;`;
  if (existing.rowCount > 0) {
    return { ok: false, error: 'That username is already taken.' };
  }
  const passwordHash = await hashPassword(password);
  const result = await sql`
    INSERT INTO admin_users (username, password_hash, email, role, status)
    VALUES (${username}, ${passwordHash}, ${email}, 'admin', 'pending')
    RETURNING id;
  `;
  return { ok: true, id: result.rows[0].id as number };
}

export async function createRegistrationApprovalToken(adminUserId: number): Promise<string> {
  const rawToken = randomHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + REGISTRATION_TOKEN_TTL_MS).toISOString();
  await sql`
    INSERT INTO admin_registration_approvals (admin_user_id, token_hash, expires_at)
    VALUES (${adminUserId}, ${tokenHash}, ${expiresAt});
  `;
  return rawToken;
}

// Resolves an emailed approve/reject link. No login required - the token itself is
// the credential, single-use and expiring after 7 days.
export async function decideRegistration(
  rawToken: string,
  decision: 'approved' | 'rejected'
): Promise<{ ok: true; username: string; email: string | null } | { ok: false; error: string }> {
  const tokenHash = await sha256Hex(rawToken);
  const result = await sql`
    SELECT id, admin_user_id, expires_at, decided_at FROM admin_registration_approvals
    WHERE token_hash = ${tokenHash} ORDER BY created_at DESC LIMIT 1;
  `;
  if (result.rowCount === 0) return { ok: false, error: 'This approval link is invalid.' };
  const row = result.rows[0] as { id: number; admin_user_id: number; expires_at: string; decided_at: string | null };
  if (row.decided_at) return { ok: false, error: 'This registration has already been decided.' };
  if (new Date(row.expires_at) < new Date()) return { ok: false, error: 'This approval link has expired.' };

  const userResult = await sql`SELECT username, email FROM admin_users WHERE id = ${row.admin_user_id} LIMIT 1;`;
  if (userResult.rowCount === 0) return { ok: false, error: 'The associated account no longer exists.' };
  const user = userResult.rows[0] as { username: string; email: string | null };

  const newStatus = decision === 'approved' ? 'active' : 'rejected';
  await sql`UPDATE admin_users SET status = ${newStatus}, deactivated_at = NULL, deactivated_by = NULL, updated_at = now() WHERE id = ${row.admin_user_id};`;
  await sql`UPDATE admin_registration_approvals SET decided_at = now(), decision = ${decision} WHERE id = ${row.id};`;

  return { ok: true, username: user.username, email: user.email };
}

export type AdminUserRow = {
  id: number;
  username: string;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
  deactivated_at: string | null;
  deactivated_by: string | null;
  days_until_deletion: number | null;
};

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  await ensureAdminUsersSeeded();
  // Purge deactivated accounts past 90 days on read so UI/behavior stays consistent even without cron.
  await sql`DELETE FROM admin_users WHERE status = 'deactivated' AND deactivated_at IS NOT NULL AND deactivated_at < now() - interval '90 days';`;
  const result = await sql`
    SELECT id, username, email, role, status, created_at, deactivated_at, deactivated_by,
      CASE WHEN status = 'deactivated' AND deactivated_at IS NOT NULL
        THEN GREATEST(0, 90 - FLOOR(EXTRACT(EPOCH FROM (now() - deactivated_at)) / 86400)::int)
        ELSE NULL END AS days_until_deletion
    FROM admin_users
    ORDER BY created_at DESC, id DESC;
  `;
  return result.rows as AdminUserRow[];
}

export async function setAdminUserStatus(
  id: number,
  action: 'approve' | 'reject' | 'deactivate' | 'reactivate',
  actorUsername: string
): Promise<{ ok: true; email: string | null; username: string } | { ok: false; error: string }> {
  await ensureAdminUsersSeeded();
  const result = await sql`SELECT id, username, email, status, role FROM admin_users WHERE id = ${id} LIMIT 1;`;
  if (result.rowCount === 0) return { ok: false, error: 'Account not found.' };
  const row = result.rows[0] as { id: number; username: string; email: string | null; status: string; role: string };

  if (action === 'approve') {
    if (row.status !== 'pending') return { ok: false, error: 'Only pending accounts can be approved.' };
    await sql`UPDATE admin_users SET status = 'active', deactivated_at = NULL, deactivated_by = NULL, updated_at = now() WHERE id = ${id};`;
  } else if (action === 'reject') {
    if (row.status !== 'pending') return { ok: false, error: 'Only pending accounts can be rejected.' };
    await sql`UPDATE admin_users SET status = 'rejected', updated_at = now() WHERE id = ${id};`;
  } else if (action === 'deactivate') {
    if (row.status !== 'active') return { ok: false, error: 'Only active accounts can be deactivated.' };
    if (row.username === actorUsername) return { ok: false, error: 'You cannot deactivate your own account.' };
    if (row.role === 'developer') return { ok: false, error: 'Developer account cannot be deactivated.' };
    await sql`UPDATE admin_users SET status = 'deactivated', deactivated_at = now(), deactivated_by = ${actorUsername}, updated_at = now() WHERE id = ${id};`;
  } else if (action === 'reactivate') {
    if (row.status !== 'deactivated') return { ok: false, error: 'Only deactivated accounts can be reactivated.' };
    await sql`UPDATE admin_users SET status = 'active', deactivated_at = NULL, deactivated_by = NULL, updated_at = now() WHERE id = ${id};`;
  }

  return { ok: true, email: row.email, username: row.username };
}

export async function deleteExpiredDeactivatedAdmins(): Promise<number> {
  await ensureAdminUsersSeeded();
  const res = await sql`DELETE FROM admin_users WHERE status = 'deactivated' AND deactivated_at IS NOT NULL AND deactivated_at < now() - interval '90 days' RETURNING id;`;
  return res.rowCount || 0;
}

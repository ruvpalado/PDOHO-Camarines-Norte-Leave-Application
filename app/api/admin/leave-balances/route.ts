import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureSchema } from '@/lib/db';
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth';
import { makeEmployeeKey } from '@/lib/employeeKey';
import { LEAVE_TYPES } from '@/lib/leaveTypes';

export const dynamic = 'force-dynamic';

const VALID_LEAVE_TYPES = new Set<string>(LEAVE_TYPES as unknown as string[]);

async function requireAdmin(req: NextRequest) {
  const session = await verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  return session;
}

// Admin-only (also enforced in middleware.ts): list every configured opening balance,
// each with the current computed available balance.
export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await ensureSchema();
    const result = await sql`
      SELECT
        lb.id, lb.last_name, lb.first_name, lb.middle_name, lb.leave_type,
        lb.opening_balance, lb.set_at, lb.updated_by,
        COALESCE((
          SELECT SUM(la.days_applied) FROM leave_applications la
          WHERE la.employee_key = lb.employee_key
            AND la.leave_type = lb.leave_type
            AND la.status = 'approved'
            AND la.decided_at > lb.set_at
        ), 0) AS used
      FROM leave_balances lb
      ORDER BY lb.last_name, lb.first_name, lb.leave_type;
    `;
    const rows = result.rows.map((r: any) => ({
      ...r,
      available: Number(r.opening_balance) - Number(r.used),
    }));
    return NextResponse.json({ balances: rows });
  } catch (err: any) {
    console.error('GET /api/admin/leave-balances failed:', err);
    return NextResponse.json({ error: 'Could not load leave balances.' }, { status: 500 });
  }
}

// Admin-only: set (create or overwrite) an employee's opening balance for a leave type.
// Resets set_at to now(), so future approved leaves of that type deduct from this new figure.
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await ensureSchema();
    const body = await req.json();
    const { lastName, firstName, middleName, leaveType, openingBalance } = body ?? {};

    if (!lastName || !firstName || !leaveType) {
      return NextResponse.json(
        { error: 'Last Name, First Name, and Leave Type are required.' },
        { status: 400 }
      );
    }
    if (!VALID_LEAVE_TYPES.has(leaveType)) {
      return NextResponse.json({ error: 'Invalid leave type.' }, { status: 400 });
    }
    const balance = Number(openingBalance);
    if (!Number.isFinite(balance) || balance < 0) {
      return NextResponse.json({ error: 'Opening balance must be a non-negative number.' }, { status: 400 });
    }

    const employeeKey = makeEmployeeKey(lastName, firstName, middleName);

    await sql`
      INSERT INTO leave_balances (last_name, first_name, middle_name, employee_key, leave_type, opening_balance, set_at, updated_by)
      VALUES (${lastName}, ${firstName}, ${middleName || null}, ${employeeKey}, ${leaveType}, ${balance}, now(), ${session.u})
      ON CONFLICT (employee_key, leave_type)
      DO UPDATE SET
        last_name = EXCLUDED.last_name,
        first_name = EXCLUDED.first_name,
        middle_name = EXCLUDED.middle_name,
        opening_balance = EXCLUDED.opening_balance,
        set_at = now(),
        updated_by = EXCLUDED.updated_by;
    `;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('POST /api/admin/leave-balances failed:', err);
    return NextResponse.json({ error: 'Could not save the leave balance.' }, { status: 500 });
  }
}

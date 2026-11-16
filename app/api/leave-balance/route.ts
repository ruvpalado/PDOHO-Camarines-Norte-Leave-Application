import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureSchema } from '@/lib/db';
import { makeEmployeeKey } from '@/lib/employeeKey';
import { LEAVE_TYPES } from '@/lib/leaveTypes';

export const dynamic = 'force-dynamic';

const VALID_LEAVE_TYPES = new Set<string>(LEAVE_TYPES as unknown as string[]);

// Public: lets the application form show an employee's available balance for the
// leave type they're about to apply for. Matched by name (no employee login exists),
// so this is only as reliable as the name typed in matches prior submissions/admin setup.
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const lastName = req.nextUrl.searchParams.get('lastName') || '';
    const firstName = req.nextUrl.searchParams.get('firstName') || '';
    const middleName = req.nextUrl.searchParams.get('middleName') || '';
    const leaveType = req.nextUrl.searchParams.get('leaveType') || '';

    if (!lastName.trim() || !firstName.trim() || !leaveType) {
      return NextResponse.json(
        { error: 'lastName, firstName, and leaveType are required.' },
        { status: 400 }
      );
    }
    if (!VALID_LEAVE_TYPES.has(leaveType)) {
      return NextResponse.json({ error: 'Invalid leave type.' }, { status: 400 });
    }

    const employeeKey = makeEmployeeKey(lastName, firstName, middleName);

    const balRes = await sql`
      SELECT opening_balance, set_at
      FROM leave_balances
      WHERE employee_key = ${employeeKey} AND leave_type = ${leaveType}
      LIMIT 1;
    `;

    if (balRes.rowCount === 0) {
      return NextResponse.json({ configured: false });
    }

    const openingBalance = Number(balRes.rows[0].opening_balance);
    const setAt = balRes.rows[0].set_at as string;

    const usedRes = await sql`
      SELECT COALESCE(SUM(days_applied), 0) AS used
      FROM leave_applications
      WHERE employee_key = ${employeeKey}
        AND leave_type = ${leaveType}
        AND status = 'approved'
        AND decided_at > ${setAt};
    `;
    const used = Number(usedRes.rows[0].used);
    const available = openingBalance - used;

    return NextResponse.json({
      configured: true,
      openingBalance,
      used,
      available,
      asOf: setAt,
    });
  } catch (err: any) {
    console.error('GET /api/leave-balance failed:', err);
    return NextResponse.json({ error: 'Could not compute leave balance.' }, { status: 500 });
  }
}

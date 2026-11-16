import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureSchema } from '@/lib/db';
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth';
import { makeEmployeeKey } from '@/lib/employeeKey';
import { LEAVE_TYPES } from '@/lib/leaveTypes';

export const dynamic = 'force-dynamic';

const VALID_LEAVE_TYPES = new Set<string>(LEAVE_TYPES as unknown as string[]);
const MAX_ROWS = 2000;

type IncomingRecord = {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  leaveType?: string;
  openingBalance?: string | number;
};

// Admin-only (also enforced in middleware.ts): bulk-sets opening leave balances from an uploaded
// CSV/Excel file. The client parses the file into { lastName, firstName, middleName, leaveType,
// openingBalance } records and posts them here; each row is validated and upserted individually so
// a few bad rows don't block the rest of the file.
export async function POST(req: NextRequest) {
  const session = await verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureSchema();
    const body = await req.json();
    const records: IncomingRecord[] = Array.isArray(body?.records) ? body.records : [];

    if (records.length === 0) {
      return NextResponse.json(
        { error: 'No usable rows were found in the file. Make sure it has a header row with Last Name, First Name, Leave Type, and Opening Balance columns.' },
        { status: 400 }
      );
    }
    if (records.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many rows in one upload (max ${MAX_ROWS}). Please split the file into smaller batches.` },
        { status: 400 }
      );
    }

    let succeeded = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const rowNum = i + 2; // +2: 1-indexed, plus the header row

      const lastName = (r.lastName ?? '').toString().trim();
      const firstName = (r.firstName ?? '').toString().trim();
      const middleName = (r.middleName ?? '').toString().trim();
      const leaveType = (r.leaveType ?? '').toString().trim();
      const balanceRaw = r.openingBalance;
      const balance = typeof balanceRaw === 'number' ? balanceRaw : Number(String(balanceRaw ?? '').trim());

      if (!lastName || !firstName) {
        errors.push({ row: rowNum, reason: 'Missing Last Name or First Name.' });
        continue;
      }
      if (!leaveType || !VALID_LEAVE_TYPES.has(leaveType)) {
        errors.push({ row: rowNum, reason: `Leave Type "${leaveType || '(blank)'}" is missing or not recognized.` });
        continue;
      }
      if (!Number.isFinite(balance) || balance < 0) {
        errors.push({ row: rowNum, reason: 'Opening Balance must be a non-negative number.' });
        continue;
      }

      const employeeKey = makeEmployeeKey(lastName, firstName, middleName);

      try {
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
        succeeded++;
      } catch (rowErr) {
        console.error(`Bulk leave-balance upload: row ${rowNum} failed:`, rowErr);
        errors.push({ row: rowNum, reason: 'Could not save this row (database error).' });
      }
    }

    return NextResponse.json({
      ok: true,
      total: records.length,
      succeeded,
      failed: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (err: any) {
    console.error('POST /api/admin/leave-balances/bulk failed:', err);
    return NextResponse.json({ error: 'Could not process the uploaded file.' }, { status: 500 });
  }
}

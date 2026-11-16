import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureSchema } from '@/lib/db';
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Admin-only (also enforced in middleware.ts): returns both report views in one call -
// individual approved-leave records, and an aggregate count of distinct staff per leave type.
// Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD filters by the leave's start date.
export async function GET(req: NextRequest) {
  const session = await verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureSchema();
    const fromParam = req.nextUrl.searchParams.get('from');
    const toParam = req.nextUrl.searchParams.get('to');
    const from = fromParam && fromParam.trim() ? fromParam : null;
    const to = toParam && toParam.trim() ? toParam : null;

    const individualRes = await sql`
      SELECT
        id, last_name, first_name, middle_name, position, facility_name,
        leave_type, details_category, details_specify,
        start_date, end_date, days_applied, commutation,
        decided_at, decided_by
      FROM leave_applications
      WHERE status = 'approved'
        AND (${from}::date IS NULL OR start_date >= ${from}::date)
        AND (${to}::date IS NULL OR start_date <= ${to}::date)
      ORDER BY start_date DESC, last_name, first_name;
    `;

    const aggregateRes = await sql`
      SELECT
        leave_type,
        COUNT(DISTINCT employee_key) AS staff_count,
        COUNT(*) AS applications_count,
        COALESCE(SUM(days_applied), 0) AS total_days
      FROM leave_applications
      WHERE status = 'approved'
        AND (${from}::date IS NULL OR start_date >= ${from}::date)
        AND (${to}::date IS NULL OR start_date <= ${to}::date)
      GROUP BY leave_type
      ORDER BY staff_count DESC, leave_type;
    `;

    return NextResponse.json({
      individual: individualRes.rows,
      aggregate: aggregateRes.rows,
      filters: { from, to },
    });
  } catch (err: any) {
    console.error('GET /api/admin/reports failed:', err);
    return NextResponse.json({ error: 'Could not generate the report.' }, { status: 500 });
  }
}

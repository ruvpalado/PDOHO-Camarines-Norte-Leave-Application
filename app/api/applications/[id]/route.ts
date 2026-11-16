import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureSchema } from '@/lib/db';
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth';
import { sendLeaveStatusEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Admin-only (also enforced in middleware.ts - checked again here as defense-in-depth,
// and because we need the admin's username for the decided_by column).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid application id.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const action = body?.action;
    const note = typeof body?.note === 'string' ? body.note : null;
    if (action !== 'approve' && action !== 'reject' && action !== 'cancel') {
      return NextResponse.json({ error: 'action must be "approve", "reject", or "cancel".' }, { status: 400 });
    }

    await ensureSchema();

    let result;
    let newStatus: 'approved' | 'rejected' | 'cancelled';
    if (action === 'cancel') {
      // Cancelling an already-approved leave: status flips to 'cancelled', which is not
      // 'approved', so every balance/report query that filters on status = 'approved'
      // automatically stops counting these days - that's what restores the leave credit.
      // decided_at/decided_by/decision_note (the original approval record) are left untouched;
      // the cancellation itself is recorded separately in cancelled_at/cancelled_by/cancel_reason.
      newStatus = 'cancelled';
      result = await sql`
        UPDATE leave_applications
        SET status = 'cancelled', cancelled_at = now(), cancelled_by = ${session.u}, cancel_reason = ${note}
        WHERE id = ${id} AND status = 'approved'
        RETURNING id, last_name, first_name, email, leave_type, start_date, end_date;
      `;
      if (result.rowCount === 0) {
        return NextResponse.json(
          { error: 'Application not found, or it is not currently approved (only approved leaves can be cancelled).' },
          { status: 404 }
        );
      }
    } else {
      newStatus = action === 'approve' ? 'approved' : 'rejected';
      result = await sql`
        UPDATE leave_applications
        SET status = ${newStatus}, decided_at = now(), decided_by = ${session.u}, decision_note = ${note}
        WHERE id = ${id} AND status = 'pending'
        RETURNING id, last_name, first_name, email, leave_type, start_date, end_date;
      `;
      if (result.rowCount === 0) {
        return NextResponse.json(
          { error: 'Application not found, or it has already been decided.' },
          { status: 404 }
        );
      }
    }

    // Best-effort email notification - failures here must never block the approve/reject/cancel action.
    const row = result.rows[0] as {
      id: number;
      last_name: string;
      first_name: string;
      email: string | null;
      leave_type: string;
      start_date: string;
      end_date: string;
    };
    if (row.email) {
      sendLeaveStatusEmail({
        to: row.email,
        applicantName: `${row.first_name} ${row.last_name}`,
        leaveType: row.leave_type,
        startDate: String(row.start_date).slice(0, 10),
        endDate: String(row.end_date).slice(0, 10),
        status: newStatus,
        note,
        reference: `LM-${String(row.id).padStart(4, '0')}`,
      }).catch((err) => console.error('sendLeaveStatusEmail threw:', err));
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('PATCH /api/applications/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the application.' }, { status: 500 });
  }
}

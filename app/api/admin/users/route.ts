import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth';
import { listAdminUsers, setAdminUserStatus } from '@/lib/adminUsers';
import { sendRegistrationDecisionEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const users = await listAdminUsers();
    return NextResponse.json({ users, currentUser: session.u });
  } catch (err: any) {
    console.error('GET /api/admin/users failed:', err);
    return NextResponse.json({ error: 'Could not load admin accounts.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const id = Number(body?.id);
    const action = body?.action as 'approve' | 'reject' | 'deactivate' | 'reactivate';
    if (!Number.isInteger(id) || !['approve', 'reject', 'deactivate', 'reactivate'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    const result = await setAdminUserStatus(id, action, session.u);
    if (!result.ok) return NextResponse.json({ error: (result as { error: string }).error }, { status: 400 });

    if ((action === 'approve' || action === 'reject') && result.email) {
      await sendRegistrationDecisionEmail({
        to: result.email,
        username: result.username,
        decision: action === 'approve' ? 'approved' : 'rejected',
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('PATCH /api/admin/users failed:', err);
    return NextResponse.json({ error: 'Could not update account.' }, { status: 500 });
  }
}

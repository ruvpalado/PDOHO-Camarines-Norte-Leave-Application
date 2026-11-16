import { NextRequest, NextResponse } from 'next/server';
import { createSessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth';
import { checkAdminCredentials } from '@/lib/adminUsers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = (await req.json()) ?? {};
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
    }
    const result = await checkAdminCredentials(username, password);
    if (result === 'invalid') {
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }
    if (result === 'pending') {
      return NextResponse.json(
        { error: 'This account is still pending approval. You will be able to sign in once an administrator approves it.' },
        { status: 403 }
      );
    }
    if (result === 'rejected') {
      return NextResponse.json(
        { error: 'This account registration was not approved. Contact the system administrator for help.' },
        { status: 403 }
      );
    }
    if (result === 'deactivated') {
      return NextResponse.json(
        { error: 'This account has been deactivated. It can be reactivated by an administrator within 90 days of deactivation.' },
        { status: 403 }
      );
    }
    const cookieValue = await createSessionCookieValue(username);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60,
    });
    return res;
  } catch (err: any) {
    console.error('POST /api/admin/login failed:', err);
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
  }
}

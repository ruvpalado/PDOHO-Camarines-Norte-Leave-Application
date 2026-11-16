import { NextRequest, NextResponse } from 'next/server';
import { resetPasswordWithToken } from '@/lib/adminUsers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!username || !token || !newPassword) {
      return NextResponse.json({ error: 'Missing username, token, or new password.' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters long.' }, { status: 400 });
    }

    const ok = await resetPasswordWithToken(username, token, newPassword);
    if (!ok) {
      return NextResponse.json(
        { error: 'This password reset link is invalid or has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('POST /api/admin/reset-password failed:', err);
    return NextResponse.json({ error: 'Could not reset the password. Please try again.' }, { status: 500 });
  }
}

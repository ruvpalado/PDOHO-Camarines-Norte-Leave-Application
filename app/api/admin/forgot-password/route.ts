import { NextRequest, NextResponse } from 'next/server';
import { adminUsernameExists, getAdminEmailByUsername, createPasswordResetToken } from '@/lib/adminUsers';
import { sendPasswordResetEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Always the same response regardless of whether the username exists or has a
// recovery email on file, so this endpoint can't be used to enumerate admin usernames.
const GENERIC_MESSAGE = 'If that username exists, a password reset link has been sent to its registered email address.';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    if (!username) {
      return NextResponse.json({ error: 'Please enter your admin username.' }, { status: 400 });
    }

    const exists = await adminUsernameExists(username);
    if (exists) {
      const email = await getAdminEmailByUsername(username);
      if (email) {
        const rawToken = await createPasswordResetToken(username);
        const resetUrl = `${req.nextUrl.origin}/admin/reset-password?username=${encodeURIComponent(
          username
        )}&token=${encodeURIComponent(rawToken)}`;
        await sendPasswordResetEmail({ to: email, username, resetUrl });
      } else {
        console.warn(
          `Password reset requested for "${username}" but no recovery email is on file (set the ADMIN_EMAIL env var, or update admin_users.email).`
        );
      }
    }

    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  } catch (err: any) {
    console.error('POST /api/admin/forgot-password failed:', err);
    return NextResponse.json({ error: 'Could not process the request. Please try again.' }, { status: 500 });
  }
}

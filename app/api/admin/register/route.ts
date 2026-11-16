import { NextRequest, NextResponse } from 'next/server';
import { registerAdmin, createRegistrationApprovalToken, getApproverEmail } from '@/lib/adminUsers';
import { sendRegistrationApprovalEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Username, email, and password are all required.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }

    const result = await registerAdmin(username, password, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const rawToken = await createRegistrationApprovalToken(result.id);
    const approverEmail = getApproverEmail();
    const approveUrl = `${req.nextUrl.origin}/api/admin/registration-decision?token=${encodeURIComponent(rawToken)}&decision=approve`;
    const rejectUrl = `${req.nextUrl.origin}/api/admin/registration-decision?token=${encodeURIComponent(rawToken)}&decision=reject`;
    sendRegistrationApprovalEmail({ to: approverEmail, username, registrantEmail: email, approveUrl, rejectUrl }).catch(
      (err) => console.error('sendRegistrationApprovalEmail threw:', err)
    );

    return NextResponse.json({
      ok: true,
      message: 'Registration submitted. Your account will be reviewed, and you will be able to sign in once it is approved.',
    });
  } catch (err: any) {
    console.error('POST /api/admin/register failed:', err);
    return NextResponse.json({ error: 'Could not submit the registration. Please try again.' }, { status: 500 });
  }
}

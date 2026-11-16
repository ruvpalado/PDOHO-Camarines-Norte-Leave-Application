import { NextRequest, NextResponse } from 'next/server';
import { decideRegistration } from '@/lib/adminUsers';
import { sendRegistrationDecisionEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Reached by clicking the Approve/Reject link in the registration approval email -
// no login required, the token itself is the credential (single-use, 7-day expiry).
function htmlPage(title: string, message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${title}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #F2F6FA; color: #1a1a1a; padding: 40px 16px; text-align: center; }
  .card { background: #fff; border: 1px solid #D7E0E9; border-radius: 8px; padding: 24px; max-width: 420px; margin: 0 auto; }
  h1 { color: #1F4E78; font-size: 18px; margin: 0 0 8px; }
  p { font-size: 13.5px; color: #1a1a1a; }
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  const decisionParam = req.nextUrl.searchParams.get('decision');
  const decision = decisionParam === 'approve' ? 'approved' : decisionParam === 'reject' ? 'rejected' : null;

  if (!token || !decision) {
    return new NextResponse(htmlPage('Invalid Link', 'This approval link is missing required information.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const result = await decideRegistration(token, decision);
  if (!result.ok) {
    return new NextResponse(htmlPage('Could Not Process', result.error), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (result.email) {
    sendRegistrationDecisionEmail({ to: result.email, username: result.username, decision }).catch((err) =>
      console.error('sendRegistrationDecisionEmail threw:', err)
    );
  }

  const title = decision === 'approved' ? 'Registration Approved' : 'Registration Rejected';
  const message =
    decision === 'approved'
      ? `The account &quot;${result.username}&quot; has been approved and can now sign in.`
      : `The account &quot;${result.username}&quot; has been rejected.`;
  return new NextResponse(htmlPage(title, message), { status: 200, headers: { 'Content-Type': 'text/html' } });
}

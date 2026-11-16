// Sends leave-status notification emails via Resend's REST API (https://resend.com).
// Uses plain fetch instead of the Resend SDK so we don't add an extra npm dependency.
// If RESEND_API_KEY isn't set, this silently no-ops (logs a warning) rather than
// failing the approve/reject request - email delivery should never block an admin action.

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

export async function sendLeaveStatusEmail(params: {
  to: string;
  applicantName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: 'submitted' | 'approved' | 'rejected' | 'cancelled';
  note?: string | null;
  reference: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set - skipping email notification for', params.reference);
    return;
  }

  const from = process.env.EMAIL_FROM || 'Leave Monitoring <onboarding@resend.dev>';
  const { to, applicantName, leaveType, startDate, endDate, status, note, reference } = params;

  const subjectByStatus: Record<typeof status, string> = {
    submitted: `Leave Application ${reference} - Received`,
    approved: `Leave Application ${reference} - Approved`,
    rejected: `Leave Application ${reference} - Rejected`,
    cancelled: `Leave Application ${reference} - Cancelled`,
  };
  const subject = subjectByStatus[status];

  const statusLineByStatus: Record<typeof status, string> = {
    submitted: 'Your leave application has been <strong>RECEIVED</strong> and is now pending admin approval.',
    approved: 'Your leave application has been <strong>APPROVED</strong>.',
    rejected: 'Your leave application has been <strong>REJECTED</strong>.',
    cancelled: 'Your previously approved leave application has been <strong>CANCELLED</strong>. Your leave credits have been restored.',
  };
  const statusLine = statusLineByStatus[status];

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1a1a1a; max-width: 480px;">
      <p>Dear ${escapeHtml(applicantName)},</p>
      <p>${statusLine}</p>
      <table style="border-collapse: collapse; margin: 12px 0;">
        <tr><td style="padding: 4px 12px 4px 0; color:#595959;">Reference</td><td>${escapeHtml(reference)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#595959;">Type of Leave</td><td>${escapeHtml(leaveType)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#595959;">Dates</td><td>${escapeHtml(startDate)} to ${escapeHtml(endDate)}</td></tr>
        ${
          (status === 'rejected' || status === 'cancelled') && note
            ? `<tr><td style="padding: 4px 12px 4px 0; color:#595959; vertical-align: top;">Reason</td><td>${escapeHtml(note)}</td></tr>`
            : ''
        }
      </table>
      <p style="color:#595959; font-size: 12px;">DOH - Bicol Center for Health Development</p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Resend email send failed:', res.status, text);
    }
  } catch (err) {
    console.error('Resend email request threw:', err);
  }
}

export async function sendPasswordResetEmail(params: { to: string; username: string; resetUrl: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set - skipping password reset email for', params.username);
    return;
  }

  const from = process.env.EMAIL_FROM || 'Leave Monitoring <onboarding@resend.dev>';
  const { to, username, resetUrl } = params;
  const subject = 'DOH-BCHD Leave Monitoring - Admin Password Reset';

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1a1a1a; max-width: 480px;">
      <p>A password reset was requested for the admin account <strong>${escapeHtml(username)}</strong>.</p>
      <p>If you requested this, click the link below to set a new password. This link expires in 30 minutes and can only be used once.</p>
      <p><a href="${resetUrl}" style="color:#1F4E78;">Reset your password</a></p>
      <p style="color:#595959; font-size: 12px;">If you did not request this, you can safely ignore this email - your password will not change.</p>
      <p style="color:#595959; font-size: 12px;">DOH - Bicol Center for Health Development</p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Resend password reset email send failed:', res.status, text);
    }
  } catch (err) {
    console.error('Resend password reset email request threw:', err);
  }
}

export async function sendRegistrationApprovalEmail(params: {
  to: string;
  username: string;
  registrantEmail: string;
  approveUrl: string;
  rejectUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set - skipping registration approval email for', params.username);
    return;
  }

  const from = process.env.EMAIL_FROM || 'Leave Monitoring <onboarding@resend.dev>';
  const { to, username, registrantEmail, approveUrl, rejectUrl } = params;
  const subject = `DOH-BCHD Leave Monitoring - New Admin Registration: ${username}`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1a1a1a; max-width: 480px;">
      <p>A new admin account registration is waiting for your approval.</p>
      <table style="border-collapse: collapse; margin: 12px 0;">
        <tr><td style="padding: 4px 12px 4px 0; color:#595959;">Username</td><td>${escapeHtml(username)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#595959;">Email</td><td>${escapeHtml(registrantEmail)}</td></tr>
      </table>
      <p>
        <a href="${approveUrl}" style="color:#fff; background:#1F4E78; padding:8px 16px; border-radius:4px; text-decoration:none; display:inline-block; margin-right:8px;">Approve</a>
        <a href="${rejectUrl}" style="color:#A6291B; background:#FCE4E4; padding:8px 16px; border-radius:4px; text-decoration:none; display:inline-block;">Reject</a>
      </p>
      <p style="color:#595959; font-size: 12px;">This link expires in 7 days.</p>
      <p style="color:#595959; font-size: 12px;">DOH - Bicol Center for Health Development</p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Resend registration approval email send failed:', res.status, text);
    }
  } catch (err) {
    console.error('Resend registration approval email request threw:', err);
  }
}

export async function sendRegistrationDecisionEmail(params: {
  to: string;
  username: string;
  decision: 'approved' | 'rejected';
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set - skipping registration decision email for', params.username);
    return;
  }

  const from = process.env.EMAIL_FROM || 'Leave Monitoring <onboarding@resend.dev>';
  const { to, username, decision } = params;
  const subject = `DOH-BCHD Leave Monitoring - Registration ${decision === 'approved' ? 'Approved' : 'Rejected'}`;
  const message =
    decision === 'approved'
      ? 'Your admin account registration has been <strong>approved</strong>. You can now sign in.'
      : 'Your admin account registration has been <strong>rejected</strong>. Contact the system administrator if you believe this is a mistake.';

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1a1a1a; max-width: 480px;">
      <p>Hi ${escapeHtml(username)},</p>
      <p>${message}</p>
      <p style="color:#595959; font-size: 12px;">DOH - Bicol Center for Health Development</p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Resend registration decision email send failed:', res.status, text);
    }
  } catch (err) {
    console.error('Resend registration decision email request threw:', err);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureSchema } from '@/lib/db';
import { LEAVE_TYPES } from '@/lib/leaveTypes';
import { makeEmployeeKey } from '@/lib/employeeKey';
import { sendLeaveStatusEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'cancelled']);
const VALID_LEAVE_TYPES = new Set<string>(LEAVE_TYPES as unknown as string[]);
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 MB - keeps the base64 request body under Vercel's function payload limit
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Server-side mirror of the client-side check in app/page.tsx - the client check can be
// bypassed, so this is the enforcement that actually matters.
function filenameMatchesApplicant(filename: string, firstName: string, lastName: string): boolean {
  const base = normalizeForMatch(filename.replace(/\.[^./\\]+$/, ''));
  const fn = normalizeForMatch(firstName);
  const ln = normalizeForMatch(lastName);
  if (!fn || !ln) return false;
  return base.includes(fn) && base.includes(ln);
}

// Columns returned to the admin list view - deliberately excludes attachment_data
// (the binary blob) so the JSON payload stays small; has_attachment flags whether
// a file exists so the UI can show a Download link.
const LIST_COLUMNS = `
  id, last_name, first_name, middle_name, email, date_filed, position, salary, leave_type,
  details_category, details_specify, facility_name, start_date, end_date, days_applied, commutation,
  status, submitted_at, decided_at, decided_by, decision_note,
  cancelled_at, cancelled_by, cancel_reason,
  attachment_filename, (attachment_data IS NOT NULL) AS has_attachment
`;

// Public: employee submits a new leave application. No auth required.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const {
      lastName,
      firstName,
      middleName,
      email,
      dateFiled,
      position,
      salary,
      leaveType,
      detailsCategory,
      detailsSpecify,
      facilityName,
      startDate,
      endDate,
      daysApplied,
      commutation,
      attachmentFileName,
      attachmentMimeType,
      attachmentDataUrl,
    } = body ?? {};

    if (!lastName || !firstName || !email || !leaveType || !startDate || !endDate || !daysApplied) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: Last Name, First Name, Email Address, Type of Leave, Start Date, End Date, Days Applied.',
        },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (!VALID_LEAVE_TYPES.has(leaveType)) {
      return NextResponse.json({ error: 'Invalid Type of Leave.' }, { status: 400 });
    }
    const days = Number(daysApplied);
    if (!Number.isFinite(days) || days <= 0) {
      return NextResponse.json({ error: 'Number of Working Days Applied must be a positive number.' }, { status: 400 });
    }

    let attachmentBuffer: Buffer | null = null;
    if (attachmentDataUrl) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(attachmentDataUrl);
      if (!match) {
        return NextResponse.json(
          { error: 'Attached file could not be read. Please try re-attaching it.' },
          { status: 400 }
        );
      }
      attachmentBuffer = Buffer.from(match[2], 'base64');
      if (attachmentBuffer.length > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: 'Attached file is too large. Maximum size is 3 MB.' }, { status: 400 });
      }
      if (!attachmentFileName || !filenameMatchesApplicant(attachmentFileName, firstName, lastName)) {
        return NextResponse.json(
          { error: "The attached file's name must include the applicant's First Name and Last Name." },
          { status: 400 }
        );
      }
    }

    const employeeKey = makeEmployeeKey(lastName, firstName, middleName);

    const result = await sql`
      INSERT INTO leave_applications
        (last_name, first_name, middle_name, email, date_filed, position, salary, leave_type,
         details_category, details_specify, facility_name, employee_key, start_date, end_date, days_applied, commutation,
         attachment_filename, attachment_mimetype, attachment_data, status)
      VALUES
        (${lastName}, ${firstName}, ${middleName || null}, ${email}, ${dateFiled || null}, ${position || null},
         ${salary ? Number(salary) : null}, ${leaveType}, ${detailsCategory || null}, ${detailsSpecify || null},
         ${facilityName || null}, ${employeeKey}, ${startDate}, ${endDate}, ${days}, ${commutation || 'Not Requested'},
         ${attachmentBuffer ? attachmentFileName || 'attachment' : null},
         ${attachmentBuffer ? attachmentMimeType || 'application/octet-stream' : null},
         ${attachmentBuffer},
         'pending')
      RETURNING id;
    `;
    const id = result.rows[0].id as number;
    const reference = `LM-${String(id).padStart(4, '0')}`;

    sendLeaveStatusEmail({
      to: email,
      applicantName: `${firstName} ${lastName}`,
      leaveType,
      startDate,
      endDate,
      status: 'submitted',
      reference,
    }).catch((err) => console.error('sendLeaveStatusEmail (submitted) threw:', err));

    return NextResponse.json({ ok: true, id, reference }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/applications failed:', err);
    return NextResponse.json({ error: 'Could not submit the application. Please try again.' }, { status: 500 });
  }
}

// Admin-only (enforced in middleware.ts): list applications, optionally filtered by status.
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const status = req.nextUrl.searchParams.get('status');
    if (status && !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid status filter.' }, { status: 400 });
    }
    const result = status
      ? await sql.query(`SELECT ${LIST_COLUMNS} FROM leave_applications WHERE status = $1 ORDER BY submitted_at DESC;`, [status])
      : await sql.query(`SELECT ${LIST_COLUMNS} FROM leave_applications ORDER BY submitted_at DESC;`);
    return NextResponse.json({ applications: result.rows });
  } catch (err: any) {
    console.error('GET /api/applications failed:', err);
    return NextResponse.json({ error: 'Could not load applications.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Admin-only (also enforced in middleware.ts - checked again here as defense-in-depth).
// Streams the stored attachment back as a downloadable file.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid application id.' }, { status: 400 });
  }

  try {
    const result = await sql`
      SELECT attachment_filename, attachment_mimetype, attachment_data
      FROM leave_applications WHERE id = ${id};
    `;
    if (result.rowCount === 0 || !result.rows[0].attachment_data) {
      return NextResponse.json({ error: 'No attachment found for this application.' }, { status: 404 });
    }
    const row = result.rows[0] as {
      attachment_filename: string | null;
      attachment_mimetype: string | null;
      attachment_data: Buffer;
    };
    const filename = (row.attachment_filename || `attachment-${id}`).replace(/"/g, '');
    const mimetype = row.attachment_mimetype || 'application/octet-stream';
    const data = row.attachment_data;

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': mimetype,
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(data.length),
      },
    });
  } catch (err: any) {
    console.error('GET /api/applications/[id]/attachment failed:', err);
    return NextResponse.json({ error: 'Could not retrieve the attachment.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { deleteExpiredDeactivatedAdmins } from '@/lib/adminUsers';

export const dynamic = 'force-dynamic';

// Vercel Cron (daily) or manual call with Authorization: Bearer $CRON_SECRET.
// Deletes admin accounts deactivated > 90 days ago.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  try {
    const deleted = await deleteExpiredDeactivatedAdmins();
    return NextResponse.json({ ok: true, deleted });
  } catch (err: any) {
    console.error('Cron cleanup-deactivated-admins failed:', err);
    return NextResponse.json({ error: 'Cleanup failed.' }, { status: 500 });
  }
}

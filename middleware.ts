import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const PUBLIC_ADMIN_PAGES = new Set(['/admin/login', '/admin/reset-password', '/admin/register']);
  const isProtectedPage = pathname.startsWith('/admin') && !PUBLIC_ADMIN_PAGES.has(pathname);
  // Employee submission (POST /api/applications) stays public.
  // Listing (GET) and approve/reject (PATCH) require an admin session.
  const isApplicationsApi = pathname === '/api/applications' || pathname.startsWith('/api/applications/');
  // Setting/viewing opening leave balances is always admin-only, regardless of method.
  const isBalancesAdminApi = pathname.startsWith('/api/admin/leave-balances');
  // Generating reports is always admin-only.
  const isReportsAdminApi = pathname.startsWith('/api/admin/reports');
  const isProtectedApi = (isApplicationsApi && req.method !== 'POST') || isBalancesAdminApi || isReportsAdminApi;

  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionCookieValue(cookie);

  if (!session) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/admin/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/applications/:path*',
    '/api/applications',
    '/api/admin/leave-balances/:path*',
    '/api/admin/leave-balances',
    '/api/admin/reports/:path*',
    '/api/admin/reports',
  ],
};

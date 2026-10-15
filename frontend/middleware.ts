import { NextRequest, NextResponse } from 'next/server';
import { dashboardPathFor, type SessionRole, verifySessionToken } from '@/lib/session';

const REQUIRED_ROLE: Array<{ prefix: string; role: SessionRole }> = [
  { prefix: '/dashboard/admin', role: 'ADMIN' },
  { prefix: '/dashboard/guru', role: 'GURU' },
  { prefix: '/dashboard/siswa', role: 'SISWA' }
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const access = await verifySessionToken(req.cookies.get('lms_access_token')?.value, 'access');
  // Access token sudah lewat 15 menit tapi refresh token masih berlaku: izinkan
  // lewat, backend akan me-refresh token lewat /api/auth/refresh saat request pertama.
  const session = access ?? (await verifySessionToken(req.cookies.get('lms_refresh_token')?.value, 'refresh'));

  if (!session) {
    const response = NextResponse.redirect(new URL('/login', req.url));
    response.cookies.delete('lms_access_token');
    response.cookies.delete('lms_refresh_token');
    return response;
  }

  const required = REQUIRED_ROLE.find((item) => pathname.startsWith(item.prefix))?.role;
  if (required && required !== session.role) {
    return NextResponse.redirect(new URL(dashboardPathFor(session.role), req.url));
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-lms-role', session.role);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/dashboard/:path*', '/tryout', '/change-password']
};

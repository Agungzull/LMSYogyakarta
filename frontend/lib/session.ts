import { jwtVerify } from 'jose';

export type SessionRole = 'ADMIN' | 'GURU' | 'SISWA';

export type Session = { role: SessionRole };

const ROLE_VALUES: SessionRole[] = ['ADMIN', 'GURU', 'SISWA'];

function secretFor(kind: 'access' | 'refresh'): Uint8Array | null {
  const value = kind === 'access' ? process.env.JWT_ACCESS_SECRET : process.env.JWT_REFRESH_SECRET;
  return value ? new TextEncoder().encode(value) : null;
}

/**
 * Token divalidasi tanda tangannya di server (bukan sekadar keberadaan cookie),
 * supaya cookie yang ditulis sendiri oleh pengguna tidak bisa membuka halaman
 * dashboard. Kunci dan format sama dengan backend (HS256).
 */
export async function verifySessionToken(
  token: string | undefined | null,
  kind: 'access' | 'refresh'
): Promise<Session | null> {
  if (!token) return null;

  const secret = secretFor(kind);
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const role = payload.role;
    if (typeof role === 'string' && ROLE_VALUES.includes(role as SessionRole)) {
      return { role: role as SessionRole };
    }
    return null;
  } catch {
    return null;
  }
}

export function dashboardPathFor(role: SessionRole): string {
  if (role === 'ADMIN') return '/dashboard/admin';
  if (role === 'GURU') return '/dashboard/guru';
  return '/dashboard/siswa';
}

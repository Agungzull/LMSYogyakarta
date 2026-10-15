export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

const NO_REFRESH_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password'
];

type UnknownRecord = Record<string, unknown>;

async function readPayload(response: Response): Promise<UnknownRecord | null> {
  try {
    return (await response.json()) as UnknownRecord;
  } catch {
    return null;
  }
}

function messageFrom(payload: UnknownRecord | null, fallback: string): string {
  const message = payload?.message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}

function storeAccessToken(accessToken: string) {
  localStorage.setItem('lms_access_token', accessToken);
  document.cookie = `lms_access_token=${encodeURIComponent(accessToken)}; path=/; max-age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function endSession() {
  ['lms_access_token', 'lms_refresh_token', 'lms_user'].forEach((key) => localStorage.removeItem(key));
  document.cookie = 'lms_access_token=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'lms_refresh_token=; path=/; max-age=0; SameSite=Lax';

  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login');
  }
}

let refreshInFlight: Promise<string | null> | null = null;

function refreshSession(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = localStorage.getItem('lms_refresh_token');
      if (!refreshToken) return null;

      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          cache: 'no-store',
          credentials: 'include'
        });
        if (!response.ok) return null;

        const payload = await readPayload(response);
        const accessToken = (payload?.data as UnknownRecord | undefined)?.accessToken;
        if (typeof accessToken !== 'string') return null;

        storeAccessToken(accessToken);
        return accessToken;
      } catch {
        return null;
      }
    })()
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

async function authorizedFetch(path: string, init: RequestInit = {}, allowRefresh = true): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('lms_access_token') : null;

  const headers = new Headers(init.headers ?? {});
  if (init.body instanceof FormData) {
    headers.delete('Content-Type');
  } else if (init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'include'
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Tidak dapat menghubungi backend LMS di ${API_URL}. Pastikan server backend berjalan.`);
    }
    throw error;
  }

  const isAuthPath = NO_REFRESH_PATHS.some((prefix) => path.startsWith(prefix));
  if (response.status === 401 && allowRefresh && !isAuthPath) {
    const accessToken = await refreshSession();
    if (accessToken) {
      return authorizedFetch(path, init, false);
    }
    endSession();
    throw new Error('Sesi Anda telah berakhir. Silakan login kembali.');
  }

  return response;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(path, options);
  const payload = await readPayload(response);

  if (!response.ok) {
    throw new Error(messageFrom(payload, `Request gagal (HTTP ${response.status})`));
  }

  return payload as T;
}

export async function openProtectedResource(path: string, download = false) {
  if (!localStorage.getItem('lms_access_token')) throw new Error('Sesi login tidak ditemukan');

  const previewWindow = download ? null : window.open('about:blank', '_blank');
  try {
    const response = await authorizedFetch(`${path}${download ? '?download=1' : ''}`);

    if (!response.ok) {
      const payload = await readPayload(response);
      throw new Error(messageFrom(payload, 'File tidak dapat dibuka'));
    }

    const objectUrl = URL.createObjectURL(await response.blob());
    if (download) {
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'materi.pdf';
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else if (previewWindow) {
      previewWindow.location.href = objectUrl;
    } else {
      throw new Error('Izinkan pop-up untuk membuka PDF');
    }

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    previewWindow?.close();
    throw error;
  }
}

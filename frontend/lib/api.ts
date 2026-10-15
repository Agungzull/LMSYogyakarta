export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('lms_access_token') : null;

  const headers = new Headers(options.headers ?? {});
  if (options.body instanceof FormData) {
    headers.delete('Content-Type');
  } else {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
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

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? 'Request gagal');
  }

  return payload as T;
}

export async function openProtectedResource(path: string, download = false) {
  const token = localStorage.getItem('lms_access_token');
  if (!token) throw new Error('Sesi login tidak ditemukan');

  const previewWindow = download ? null : window.open('about:blank', '_blank');
  try {
    const response = await fetch(`${API_URL}${path}${download ? '?download=1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
      cache: 'no-store'
    });

    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.message ?? 'File tidak dapat dibuka');
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

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { siteConfig } from '@/src/config/site';

const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Cookie hanya ada kalau sesi masih berlaku; middleware menghapusnya saat token
    // kedaluwarsa, jadi redirect ini tidak akan memantul bolak-balik ke /login.
    if (typeof document !== 'undefined' && /(?:^|;\s*)lms_access_token=/.test(document.cookie)) {
      router.replace('/dashboard');
    }
  }, [router]);

  function setSessionCookies(accessToken: string, refreshToken: string) {
    if (typeof document === 'undefined') return;

    const setCookie = (name: string, value: string, maxAge: number) => {
      document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    };

    setCookie('lms_access_token', accessToken, SESSION_MAX_AGE);
    setCookie('lms_refresh_token', refreshToken, SESSION_MAX_AGE);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await apiRequest<{
        data: {
          accessToken: string;
          refreshToken: string;
          user: { role: string; username: string; name?: string };
          mustChangePassword: boolean;
        };
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      localStorage.setItem('lms_access_token', result.data.accessToken);
      localStorage.setItem('lms_refresh_token', result.data.refreshToken);
      localStorage.setItem('lms_user', JSON.stringify(result.data.user));
      setSessionCookies(result.data.accessToken, result.data.refreshToken);

      if (result.data.mustChangePassword) {
        router.replace('/change-password');
        return;
      }

      const role = result.data.user.role;
      if (role === 'ADMIN') router.replace('/dashboard/admin');
      else if (role === 'GURU') router.replace('/dashboard/guru');
      else router.replace('/dashboard/siswa');
    } catch (err: any) {
      setError(err.message ?? 'Login gagal. Periksa username dan password Anda.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 sm:p-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="bg-slate-950 px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {siteConfig.logos.map((logo) => (
                <img key={logo.src} src={logo.src} alt={logo.alt} className="h-12 w-12 rounded-xl bg-white object-contain p-1" />
              ))}
            </div>
            <div>
              <h1 className="text-xl font-bold">{siteConfig.siteName}</h1>
              <p className="text-xs text-blue-200">{siteConfig.tagline}</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-slate-900">Masuk ke sistem</h2>
          <p className="mt-2 text-sm text-slate-600">Gunakan username atau email Anda untuk melanjutkan.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Username / Email</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username atau email"
                className="w-full"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full pr-11"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border-none bg-transparent px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  {showPassword ? 'Sembunyikan' : 'Lihat'}
                </button>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            ) : null}

            <button type="submit" className="w-full py-3 font-semibold" disabled={loading}>
              {loading ? 'Memproses...' : 'Login'}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between gap-3 text-sm text-slate-600">
            <a href="/forgot-password" className="font-medium text-blue-600 hover:text-blue-700">
              Lupa Password?
            </a>
            <a href="/" className="font-medium text-slate-600 hover:text-slate-800">
              Kembali ke beranda
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

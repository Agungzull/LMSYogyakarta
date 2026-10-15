'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '@/lib/api';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Memuat form reset password...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');

    if (!token) {
      setErrorMessage('Tautan reset tidak valid. Minta tautan baru dari halaman Lupa Password.');
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest<{ success: boolean; message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword })
      });
      setMessage(result.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal mengganti password. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">Buat Password Baru</h1>
        <p className="mt-2 text-sm text-slate-600">Masukkan password baru yang aman.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Password baru</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
          {errorMessage ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p> : null}
          <button className="w-full py-3 font-semibold" disabled={loading || !token}>
            {loading ? 'Memproses...' : 'Simpan password'}
          </button>
        </form>

        {!token ? (
          <p className="mt-4 text-sm text-red-600">Tautan reset tidak ditemukan di URL. Periksa kembali email Anda.</p>
        ) : null}
      </div>
    </main>
  );
}

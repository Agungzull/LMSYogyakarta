'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const result = await apiRequest<{ success: boolean; message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      setMessage({ type: 'success', text: result.message });

      const userRaw = localStorage.getItem('lms_user');
      const user = userRaw ? JSON.parse(userRaw) : null;
      const role = user?.role ?? 'SISWA';

      setTimeout(() => {
        if (role === 'ADMIN') router.replace('/dashboard/admin');
        else if (role === 'GURU') router.replace('/dashboard/guru');
        else router.replace('/dashboard/siswa');
      }, 800);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message ?? 'Password gagal diperbarui.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 sm:p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-200 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Ganti Password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Password Anda wajib diperbarui agar akun tetap aman dan sesuai kebijakan sistem.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Password lama</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pr-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border-none bg-transparent px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {showCurrent ? 'Sembunyikan' : 'Lihat'}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Password baru</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pr-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border-none bg-transparent px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {showNew ? 'Sembunyikan' : 'Lihat'}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Minimal 8 karakter, kombinasi huruf dan angka.</p>
          </div>

          {message ? (
            <div
              className={`rounded-xl border px-3 py-2 text-sm ${
                message.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-600'
              }`}
            >
              {message.text}
            </div>
          ) : null}

          <button type="submit" className="w-full py-3 font-semibold" disabled={loading}>
            {loading ? 'Menyimpan...' : 'Simpan Password'}
          </button>
        </form>
      </div>
    </main>
  );
}

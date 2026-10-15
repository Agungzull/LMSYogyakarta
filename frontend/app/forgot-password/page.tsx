'use client';

import { useState } from 'react';
import { apiRequest } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setErrorMessage('');
    try {
      const result = await apiRequest<{ success: boolean; message: string }>('/api/auth/forgot-password/email', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      setMessage(result.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal mengirim instruksi. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">Lupa Password</h1>
        <p className="mt-2 text-sm text-slate-600">Reset password untuk guru & admin via email.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>

          {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
          {errorMessage ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p> : null}

          <button className="w-full py-3 font-semibold" disabled={loading}>
            {loading ? 'Mengirim...' : 'Kirim instruksi'}
          </button>
        </form>

        <div className="mt-5 text-sm text-slate-600">
          <a href="/login" className="font-medium text-blue-600">Kembali ke login</a>
        </div>
      </div>
    </main>
  );
}

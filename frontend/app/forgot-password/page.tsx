'use client';

import { useState } from 'react';
import { apiRequest } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('admin@example.com');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await apiRequest<{ success: boolean; message: string }>('/api/auth/forgot-password/email', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      setMessage(result.message);
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
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}

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

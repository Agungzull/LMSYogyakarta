'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/api';

export default function LogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error('Sesi server gagal ditutup.');
      }
    } catch (error) {
      console.error('Logout server gagal:', error);
    } finally {
      localStorage.removeItem('lms_access_token');
      localStorage.removeItem('lms_refresh_token');
      localStorage.removeItem('lms_user');
      document.cookie = 'lms_access_token=; path=/; max-age=0; SameSite=Lax';
      document.cookie = 'lms_refresh_token=; path=/; max-age=0; SameSite=Lax';
      router.replace('/login');
    }
  }

  return (
    <button type="button" onClick={() => void handleLogout()} disabled={loggingOut} className="bg-white/10 text-white hover:bg-white/20 disabled:opacity-60">
      {loggingOut ? 'Keluar...' : 'Logout'}
    </button>
  );
}

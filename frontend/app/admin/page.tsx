'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

type StudentItem = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  nis: string;
  className: string | null;
};

export default function AdminPage() {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await apiRequest<{ data: StudentItem[] }>('/api/admin/students');
        setStudents(result.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Admin Panel</h1>
      <p className="mt-2 text-slate-600">Fase 2: data siswa, guru, materi, dan reset password request.</p>

      <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-semibold">Data Siswa</h2>
        </div>
        <div className="p-6">
          {loading ? (
            <p>Memuat data...</p>
          ) : students.length === 0 ? (
            <p className="text-slate-500">Belum ada data siswa.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-3">Nama</th>
                  <th className="pb-3">NIS</th>
                  <th className="pb-3">Kelas</th>
                  <th className="pb-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-b last:border-0">
                    <td className="py-3">{student.name}</td>
                    <td className="py-3">{student.nis}</td>
                    <td className="py-3">{student.className ?? '-'}</td>
                    <td className="py-3">{student.email ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

type Schedule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  className: string;
  subjectName: string;
};

export default function GuruPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await apiRequest<{ data: Schedule[] }>('/api/guru/schedules');
        setSchedules(result.data);
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
      <h1 className="text-3xl font-bold">Guru Dashboard</h1>
      <p className="mt-2 text-slate-600">Fase 3: absensi, nilai harian, jadwal, materi, dan feedback.</p>

      <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-semibold">Jadwal Mengajar</h2>
        </div>
        <div className="p-6">
          {loading ? (
            <p>Memuat jadwal...</p>
          ) : schedules.length === 0 ? (
            <p className="text-slate-500">Belum ada jadwal mengajar.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-3">Hari</th>
                  <th className="pb-3">Mata Pelajaran</th>
                  <th className="pb-3">Kelas</th>
                  <th className="pb-3">Jam</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-3">{item.dayOfWeek}</td>
                    <td className="py-3">{item.subjectName}</td>
                    <td className="py-3">{item.className}</td>
                    <td className="py-3">{item.startTime} - {item.endTime}</td>
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

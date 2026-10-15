'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

type StudentItem = {
  id: string;
  title: string;
  subjectName?: string;
  fileUrl?: string;
  message: string;
  isOpen: boolean;
};

export default function SiswaPage() {
  const [materials, setMaterials] = useState<StudentItem[]>([]);
  const [videos, setVideos] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [materialsData, videosData] = await Promise.all([
          apiRequest<{ data: StudentItem[] }>('/api/siswa/materials'),
          apiRequest<{ data: StudentItem[] }>('/api/siswa/videos')
        ]);
        setMaterials(materialsData.data);
        setVideos(videosData.data);
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
      <h1 className="text-3xl font-bold">Siswa Dashboard</h1>
      <p className="mt-2 text-slate-600">Fase 4: materi, video, jadwal, dan akses konten berbasis waktu server.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Materi PDF</h2>
          {loading ? <p className="mt-4">Memuat materi...</p> : materials.map((item) => (
            <div key={item.id} className="mt-4 rounded-lg border p-4">
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-slate-500">{item.subjectName}</p>
              <p className={`mt-2 text-sm ${item.isOpen ? 'text-emerald-600' : 'text-amber-600'}`}>{item.message}</p>
              {item.isOpen ? <a href={item.fileUrl} className="mt-3 inline-block text-sm font-medium text-blue-600" target="_blank" rel="noreferrer">Buka PDF</a> : null}
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Video Belajar</h2>
          {loading ? <p className="mt-4">Memuat video...</p> : videos.map((item) => (
            <div key={item.id} className="mt-4 rounded-lg border p-4">
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-slate-500">{item.subjectName}</p>
              <p className={`mt-2 text-sm ${item.isOpen ? 'text-emerald-600' : 'text-amber-600'}`}>{item.message}</p>
              {item.isOpen ? <a href={item.fileUrl} className="mt-3 inline-block text-sm font-medium text-blue-600" target="_blank" rel="noreferrer">Tonton Video</a> : null}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

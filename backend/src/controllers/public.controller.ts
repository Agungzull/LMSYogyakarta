import { Request, Response } from 'express';

export async function getPublicSiteConfig(_req: Request, res: Response) {
  return res.json({
    success: true,
    data: {
      siteName: 'NAMA SISTEM',
      tagline: 'Nama Lembaga',
      logo: '/logo.svg',
      primaryColor: '#1d4ed8',
      heroBadge: 'Sistem Ujian Berbasis Komputer (CBT)',
      heroTitle: 'Persiapan ujian yang lebih terarah, lebih cepat, dan lebih akurat.',
      heroSubtitle:
        'Platform CBT dan pembelajaran siswa untuk mendukung proses belajar, evaluasi, dan monitoring rutin di sekolah.',
      nextTryout: {
        title: 'TryOut Persiapan Ujian Sekolah',
        dateLabel: 'Jumat, 12 Januari 2026',
        timeLabel: '08:00 - 12:00 WIB'
      }
    }
  });
}

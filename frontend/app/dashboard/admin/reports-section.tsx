'use client';

import { useEffect, useState } from 'react';
import { API_URL, apiRequest } from '@/lib/api';

type AttendanceRecord = { date: string; status: 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPA'; note: string | null };
type DailyScore = { date: string; subject: string; score: number; activityScore: number | null; note: string | null };
type StudentReport = {
  studentId: string;
  name: string;
  nis: string;
  className: string;
  attendance: {
    total: number;
    present: number;
    permission: number;
    sick: number;
    absent: number;
    percent: number | null;
  };
  averageScore: number | null;
  scoreCount: number;
  averageActivity: number | null;
  activityCount: number;
  dailyScores: DailyScore[];
  attendanceRecords: AttendanceRecord[];
};

type ReportClass = { id: string; name: string };
type ClassExportType = 'scores' | 'attendance' | 'both';

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function display(value: number | null, suffix = '') {
  return value === null ? '-' : `${value}${suffix}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value));
}

function escapeHtml(value: string | number | null) {
  return String(value ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function ReportsSection() {
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [reports, setReports] = useState<StudentReport[]>([]);
  const [classes, setClasses] = useState<ReportClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [classExportType, setClassExportType] = useState<ClassExportType>('both');
  const [exportingClass, setExportingClass] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadClasses() {
      try {
        const result = await apiRequest<{ data: ReportClass[] }>('/api/admin/classes');
        if (!cancelled) {
          setClasses(result.data);
          setSelectedClassId((current) => current || result.data[0]?.id || '');
        }
      } catch (loadError) {
        if (!cancelled) {
          setExportError(loadError instanceof Error ? loadError.message : 'Gagal memuat daftar kelas.');
        }
      }
    }
    void loadClasses();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadReports() {
      setLoading(true);
      setError('');
      try {
        const result = await apiRequest<{ data: StudentReport[] }>(
          `/api/admin/reports/students?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`
        );
        if (!cancelled) setReports(result.data);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Gagal memuat raport siswa.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadReports();
    return () => { cancelled = true; };
  }, [month, year]);

  function printStudentReport(report: StudentReport) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Izinkan pop-up di browser untuk mencetak raport siswa.');
      return;
    }

    const scoreRows = report.dailyScores.map((item) => `
      <tr>
        <td>${escapeHtml(formatDate(item.date))}</td>
        <td>${escapeHtml(item.subject)}</td>
        <td>${escapeHtml(item.score)}</td>
        <td>${escapeHtml(item.activityScore === null ? '-' : `${item.activityScore}/5`)}</td>
        <td>${escapeHtml(item.note)}</td>
      </tr>
    `).join('');
    const attendanceRows = report.attendanceRecords.map((item) => `
      <tr>
        <td>${escapeHtml(formatDate(item.date))}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${escapeHtml(item.note)}</td>
      </tr>
    `).join('');

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="id">
        <head>
          <meta charset="utf-8">
          <title>Raport ${escapeHtml(report.name)} - ${escapeHtml(report.className)}</title>
          <style>
            body { color: #0f172a; font: 14px Arial, sans-serif; margin: 32px; }
            h1, h2, p { margin: 0; }
            h1 { font-size: 22px; }
            h2 { font-size: 16px; margin: 26px 0 10px; }
            .subtitle { color: #475569; margin-top: 6px; }
            .summary { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 20px; }
            .summary div { border: 1px solid #cbd5e1; border-radius: 8px; min-width: 120px; padding: 12px; }
            .label { color: #64748b; display: block; font-size: 12px; margin-bottom: 6px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background: #f1f5f9; }
            tr { page-break-inside: avoid; }
            @media print { body { margin: 16mm; } }
          </style>
        </head>
        <body>
          <h1>Raport Siswa</h1>
          <p class="subtitle">Periode ${escapeHtml(monthNames[Number(month) - 1])} ${escapeHtml(year)}</p>
          <div class="summary">
            <div><span class="label">Nama</span>${escapeHtml(report.name)}</div>
            <div><span class="label">NIS</span>${escapeHtml(report.nis)}</div>
            <div><span class="label">Kelas</span>${escapeHtml(report.className)}</div>
            <div><span class="label">Rata-rata nilai</span>${escapeHtml(display(report.averageScore))}</div>
            <div><span class="label">Rata-rata keaktifan</span>${escapeHtml(display(report.averageActivity, '/5'))}</div>
            <div><span class="label">Kehadiran</span>${escapeHtml(display(report.attendance.percent, '%'))} (${escapeHtml(report.attendance.present)}/${escapeHtml(report.attendance.total)} hadir)</div>
          </div>
          <h2>Rincian Nilai</h2>
          ${report.dailyScores.length ? `<table><thead><tr><th>Tanggal</th><th>Mata Pelajaran</th><th>Nilai</th><th>Keaktifan</th><th>Catatan</th></tr></thead><tbody>${scoreRows}</tbody></table>` : '<p>Belum ada nilai pada periode ini.</p>'}
          <h2>Rincian Absensi</h2>
          <p class="subtitle">Izin ${escapeHtml(report.attendance.permission)} · Sakit ${escapeHtml(report.attendance.sick)} · Alpa ${escapeHtml(report.attendance.absent)}</p>
          ${report.attendanceRecords.length ? `<table style="margin-top:10px"><thead><tr><th>Tanggal</th><th>Status</th><th>Catatan</th></tr></thead><tbody>${attendanceRows}</tbody></table>` : '<p>Belum ada absensi pada periode ini.</p>'}
        </body>
      </html>`);
    printWindow.document.close();
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  }

  async function exportClassReport() {
    if (!selectedClassId) {
      setExportError('Pilih kelas yang akan diekspor.');
      return;
    }

    setExportingClass(true);
    setExportError('');
    try {
      const token = localStorage.getItem('lms_access_token');
      if (!token) throw new Error('Sesi login tidak ditemukan. Silakan login kembali.');

      const query = new URLSearchParams({
        classId: selectedClassId,
        type: classExportType,
        month,
        year
      });
      const response = await fetch(`${API_URL}/api/admin/reports/classes/export?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
        cache: 'no-store'
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message ?? 'Gagal mengekspor laporan kelas.');
      }

      const file = await response.blob();
      const objectUrl = URL.createObjectURL(file);
      const selectedClass = classes.find((item) => item.id === selectedClassId);
      const classFilename = (selectedClass?.name ?? 'kelas').replace(/[^a-zA-Z0-9_-]/g, '-');
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `rapor-${classFilename}-${classExportType}-${year}-${month.padStart(2, '0')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (exportFailure) {
      setExportError(exportFailure instanceof Error ? exportFailure.message : 'Gagal mengekspor laporan kelas.');
    } finally {
      setExportingClass(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Raport Siswa</h2>
          <p className="mt-1 text-sm text-slate-500">
            Rekap per siswa dari nilai harian, penilaian keaktifan guru, dan absensi.
          </p>
        </div>
        <div className="flex gap-3">
          <label className="text-sm text-slate-600">
            Bulan
            <select value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2">
              {monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Tahun
            <select value={year} onChange={(event) => setYear(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2">
              {Array.from({ length: 6 }, (_, index) => today.getFullYear() - index).map((optionYear) => (
                <option key={optionYear} value={optionYear}>{optionYear}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Kehadiran dihitung dari absensi yang sudah dicatat guru. Tanda “-” berarti belum ada catatan pada periode tersebut.
      </p>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="font-semibold text-slate-900">Ekspor raport per kelas (Excel)</h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-600">
            Kelas
            <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2" disabled={!classes.length}>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Data
            <select value={classExportType} onChange={(event) => setClassExportType(event.target.value as ClassExportType)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2">
              <option value="scores">Nilai saja</option>
              <option value="attendance">Absensi saja</option>
              <option value="both">Nilai dan absensi</option>
            </select>
          </label>
          <button type="button" onClick={() => void exportClassReport()} disabled={!selectedClassId || exportingClass} className="disabled:cursor-not-allowed disabled:opacity-60">
            {exportingClass ? 'Menyiapkan Excel...' : 'Unduh Excel'}
          </button>
        </div>
        {exportError ? <p role="alert" className="mt-3 text-sm text-red-700">{exportError}</p> : null}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-3">Siswa</th>
              <th className="px-3 py-3">Kelas</th>
              <th className="px-3 py-3">Rata-rata nilai</th>
              <th className="px-3 py-3">Keaktifan / 5</th>
              <th className="px-3 py-3">Kehadiran</th>
              <th className="px-3 py-3">Rincian</th>
              <th className="px-3 py-3">Ekspor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-5 text-slate-500">Memuat raport...</td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-5 text-slate-500">Belum ada data siswa.</td></tr>
            ) : reports.map((report) => (
              <tr key={report.studentId} className="border-t border-slate-200 align-top">
                <td className="px-3 py-3">
                  <p className="font-medium text-slate-900">{report.name}</p>
                  <p className="text-xs text-slate-500">NIS {report.nis}</p>
                </td>
                <td className="px-3 py-3">{report.className}</td>
                <td className="px-3 py-3">{display(report.averageScore)}<span className="text-xs text-slate-500"> · {report.scoreCount} nilai</span></td>
                <td className="px-3 py-3">{display(report.averageActivity)}<span className="text-xs text-slate-500"> · {report.activityCount} penilaian</span></td>
                <td className="px-3 py-3">
                  <p>{display(report.attendance.percent, '%')}</p>
                  <p className="text-xs text-slate-500">
                    Hadir {report.attendance.present}/{report.attendance.total}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <details>
                    <summary className="cursor-pointer font-medium text-blue-700">Lihat rincian</summary>
                    <div className="min-w-64 space-y-3 py-3">
                      <p className="text-xs text-slate-600">
                        Izin {report.attendance.permission} · Sakit {report.attendance.sick} · Alpa {report.attendance.absent}
                      </p>
                      {report.dailyScores.length ? (
                        <ul className="space-y-2">
                          {report.dailyScores.map((item, index) => (
                            <li key={`${item.date}-${item.subject}-${index}`} className="rounded-lg bg-slate-50 p-2 text-xs">
                              <p className="font-semibold">{item.subject} · {formatDate(item.date)}</p>
                              <p>Nilai {item.score} · Keaktifan {display(item.activityScore, '/5')}</p>
                              {item.note ? <p className="mt-1 text-slate-500">Catatan: {item.note}</p> : null}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-xs text-slate-500">Belum ada nilai harian.</p>}
                      {report.attendanceRecords.length ? (
                        <ul className="space-y-1 text-xs text-slate-600">
                          {report.attendanceRecords.map((item, index) => (
                            <li key={`${item.date}-${index}`}>
                              {formatDate(item.date)} · {item.status}{item.note ? ` · ${item.note}` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-xs text-slate-500">Belum ada absensi.</p>}
                    </div>
                  </details>
                </td>
                <td className="px-3 py-3">
                  <button type="button" onClick={() => printStudentReport(report)} className="whitespace-nowrap">
                    Cetak / Simpan PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

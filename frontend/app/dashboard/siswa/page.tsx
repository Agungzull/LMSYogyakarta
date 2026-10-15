'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL, apiRequest, openProtectedResource } from '@/lib/api';
import LogoutButton from '@/components/logout-button';

type DashboardSummary = {
  studentName: string;
  className: string | null;
  scheduleCount: number;
  materialCount: number;
  videoCount: number;
  tryoutCount: number;
};

type Schedule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectName: string;
  teacherName: string;
};

type ContentItem = {
  id: string;
  title: string;
  subjectName: string;
  fileUrl: string | null;
  weekNumber: number;
  availableFrom: string;
  availableUntil: string;
  isOpen: boolean;
  message: string;
};

type Tryout = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  isOpen: boolean;
  message: string;
};

type TryoutResult = {
  attemptId: string;
  title: string;
  submittedAt: string | null;
  score: number;
  maxScore: number;
  studentName: string;
  className: string;
  questionCount: number;
  certificateEnabled: boolean;
  certificateMinimumScore: number;
  certificateSignerName: string;
  certificateSignerTitle: string;
  correctCount: number;
  answeredCount: number;
};

type TryoutResultDetails = {
  questions: Array<{
    id: string;
    type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
    text: string;
    imageUrl: string | null;
    options: string[];
    selectedAnswer: string | string[] | null;
    correctAnswer: string | string[];
    isCorrect: boolean;
    explanation: string | null;
    explanationImageUrl: string | null;
  }>;
};

const dayNames: Record<number, string> = {
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
  7: 'Minggu'
};

function escapeHtml(value: string | number | null) {
  return String(value ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTryoutDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(value))
    : 'Tanggal tidak tersedia';
}

function toAnswerList(value: string | string[] | null) {
  return Array.isArray(value) ? value : value === null ? [] : [value];
}

export default function SiswaDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [materials, setMaterials] = useState<ContentItem[]>([]);
  const [videos, setVideos] = useState<ContentItem[]>([]);
  const [tryouts, setTryouts] = useState<Tryout[]>([]);
  const [tryoutResults, setTryoutResults] = useState<TryoutResult[]>([]);
  const [tryoutResultDetails, setTryoutResultDetails] = useState<Record<string, TryoutResultDetails>>({});
  const [loadingTryoutResults, setLoadingTryoutResults] = useState<Record<string, boolean>>({});
  const [tryoutResultErrors, setTryoutResultErrors] = useState<Record<string, string>>({});
  const [openTryoutResults, setOpenTryoutResults] = useState<string[]>([]);
  const [explanationImageUrls, setExplanationImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const explanationObjectUrls = useRef<string[]>([]);
  const explanationImageRequests = useRef(new Set<string>());

  useEffect(() => {
    async function loadAll() {
      try {
        const [dashboardResult, scheduleResult, materialResult, videoResult, tryoutResult, resultHistory] = await Promise.all([
          apiRequest<{ data: DashboardSummary }>('/api/siswa/dashboard'),
          apiRequest<{ data: Schedule[] }>('/api/siswa/schedules'),
          apiRequest<{ data: ContentItem[] }>('/api/siswa/materials'),
          apiRequest<{ data: ContentItem[] }>('/api/siswa/videos'),
          apiRequest<{ data: Tryout[] }>('/api/siswa/tryouts'),
          apiRequest<{ data: TryoutResult[] }>('/api/siswa/tryouts/results')
        ]);

        setSummary(dashboardResult.data);
        setSchedules(scheduleResult.data);
        setMaterials(materialResult.data);
        setVideos(videoResult.data);
        setTryouts(tryoutResult.data);
        setTryoutResults(resultHistory.data);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Gagal memuat data dashboard siswa.');
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, []);

  useEffect(() => () => {
    explanationObjectUrls.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('lms_access_token');
    const images = tryoutResults
      .filter((result) => openTryoutResults.includes(result.attemptId))
      .flatMap((result) => tryoutResultDetails[result.attemptId]?.questions ?? [])
      .filter((question): question is typeof question & { explanationImageUrl: string } => Boolean(question.explanationImageUrl))
      .map((question) => ({ id: question.id, url: question.explanationImageUrl }));

    if (!token || images.length === 0) return;

    async function loadImages() {
      const loadedImages = await Promise.all(images.map(async (image) => {
        if (explanationImageUrls[image.id] || explanationImageRequests.current.has(image.id)) return null;
        explanationImageRequests.current.add(image.id);
        try {
          const response = await fetch(`${API_URL}${image.url}`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include',
            cache: 'no-store'
          });
          if (!response.ok) {
            throw new Error('Gambar pembahasan Tryout gagal dimuat.');
          }
          const objectUrl = URL.createObjectURL(await response.blob());
          explanationObjectUrls.current.push(objectUrl);
          return [image.id, objectUrl] as const;
        } catch (error) {
          explanationImageRequests.current.delete(image.id);
          throw error;
        }
      }));

      const imageEntries = loadedImages.filter((image): image is readonly [string, string] => image !== null);
      // Guard ini penting: tanpanya setState selalu menghasilkan objek baru walau
      // tidak ada gambar baru, effect jadi berputar terus karena
      // explanationImageUrls ikut jadi dependency.
      if (!cancelled && imageEntries.length > 0) {
        setExplanationImageUrls((current) => ({ ...current, ...Object.fromEntries(imageEntries) }));
      }
    }

    void loadImages().catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Gambar pembahasan gagal dimuat.');
    });

    return () => {
      cancelled = true;
    };
  }, [tryoutResults, tryoutResultDetails, openTryoutResults, explanationImageUrls]);

  async function loadTryoutResultDetails(attemptId: string) {
    if (tryoutResultDetails[attemptId] || loadingTryoutResults[attemptId]) return;
    setLoadingTryoutResults((current) => ({ ...current, [attemptId]: true }));
    setTryoutResultErrors((current) => ({ ...current, [attemptId]: '' }));
    try {
      const result = await apiRequest<{ data: TryoutResultDetails }>(`/api/siswa/tryouts/results/${attemptId}`);
      setTryoutResultDetails((current) => ({ ...current, [attemptId]: result.data }));
    } catch (error) {
      setTryoutResultErrors((current) => ({
        ...current,
        [attemptId]: error instanceof Error ? error.message : 'Gagal memuat pembahasan TryOut.'
      }));
    } finally {
      setLoadingTryoutResults((current) => ({ ...current, [attemptId]: false }));
    }
  }

  function toggleTryoutResult(attemptId: string, isOpen: boolean) {
    setOpenTryoutResults((current) => isOpen
      ? current.includes(attemptId) ? current : [...current, attemptId]
      : current.filter((id) => id !== attemptId)
    );
    if (isOpen) void loadTryoutResultDetails(attemptId);
  }

  function printCertificate(result: TryoutResult) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setLoadError('Izinkan pop-up di browser untuk mencetak sertifikat tryout.');
      return;
    }

    const certificateYear = result.submittedAt ? new Date(result.submittedAt).getFullYear() : new Date().getFullYear();
    const certificateId = `CERT-${certificateYear}-${result.attemptId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const signer = result.certificateSignerName
      ? `<div class="signature"><p>${escapeHtml(result.certificateSignerTitle || 'Penandatangan')}</p><p class="signer-name">${escapeHtml(result.certificateSignerName)}</p></div>`
      : '';
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="id">
        <head>
          <meta charset="utf-8">
          <title>Sertifikat Penyelesaian Tryout - ${escapeHtml(result.studentName)}</title>
          <style>
            * { box-sizing: border-box; }
            body { align-items: center; background: #f1f5f9; color: #0f172a; display: flex; font-family: Georgia, serif; justify-content: center; min-height: 100vh; margin: 0; padding: 32px; }
            .certificate { background: #fff; border: 10px double #1d4ed8; max-width: 1000px; padding: 56px; text-align: center; width: 100%; }
            .brand { color: #1d4ed8; font: bold 14px Arial, sans-serif; letter-spacing: .18em; text-transform: uppercase; }
            h1 { color: #1e3a8a; font-size: 38px; margin: 30px 0 12px; }
            .intro { color: #475569; font: 18px Arial, sans-serif; }
            .name { border-bottom: 2px solid #cbd5e1; color: #0f172a; display: inline-block; font-size: 32px; font-weight: bold; margin: 26px 0 14px; padding: 0 28px 10px; }
            .details { color: #334155; font: 17px/1.8 Arial, sans-serif; margin: 18px auto; max-width: 700px; }
            .score { color: #1d4ed8; font: bold 22px Arial, sans-serif; margin: 22px 0; }
            .certificate-id { color: #64748b; font: 12px Arial, sans-serif; margin-top: 36px; }
            .signature { color: #334155; font: 15px/1.6 Arial, sans-serif; margin: 48px 0 0 auto; max-width: 280px; text-align: center; }
            .signer-name { border-top: 1px solid #64748b; font-weight: bold; margin-top: 64px; padding-top: 8px; }
            @page { size: A4 landscape; margin: 12mm; }
            @media print { body { background: #fff; min-height: auto; padding: 0; } .certificate { max-width: none; } }
          </style>
        </head>
        <body>
          <main class="certificate">
            <p class="brand">Learning Management System Cakrawala</p>
            <h1>Sertifikat Penyelesaian Tryout</h1>
            <p class="intro">Diberikan kepada</p>
            <p class="name">${escapeHtml(result.studentName)}</p>
            <p class="details">
              Siswa ${escapeHtml(result.className)} telah menyelesaikan tryout
              <strong>${escapeHtml(result.title)}</strong>.
            </p>
            <p class="score">Nilai ${escapeHtml(result.score)} dari ${escapeHtml(result.maxScore)}</p>
            <p class="details">Diselesaikan pada ${escapeHtml(formatTryoutDate(result.submittedAt))}</p>
            ${signer}
            <p class="certificate-id">Nomor sertifikat: ${escapeHtml(certificateId)}</p>
          </main>
          <script>window.addEventListener('load', () => window.print());</script>
        </body>
      </html>`);
    printWindow.document.close();
  }

  if (loading) {
    return <main className="p-8 text-slate-700">Memuat dashboard siswa...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-500 p-8 text-white shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-indigo-100">Siswa</p>
              <h1 className="mt-2 text-3xl font-bold">Dashboard Siswa</h1>
              <p className="mt-2 text-indigo-50">
                {summary?.studentName ?? 'Siswa'} • {summary?.className ?? 'Belum terdaftar kelas'}
              </p>
            </div>
            <LogoutButton />
          </div>
        </header>

        {loadError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Jadwal</p>
            <p className="mt-3 text-3xl font-bold">{summary?.scheduleCount ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Materi</p>
            <p className="mt-3 text-3xl font-bold">{summary?.materialCount ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Video</p>
            <p className="mt-3 text-3xl font-bold">{summary?.videoCount ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Tryout</p>
            <p className="mt-3 text-3xl font-bold">{summary?.tryoutCount ?? 0}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Jadwal Kelas</h2>
            {schedules.length === 0 ? (
              <p className="mt-4 text-slate-500">Belum ada jadwal untuk kelas Anda.</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Hari</th>
                      <th className="px-3 py-2">Mapel</th>
                      <th className="px-3 py-2">Guru</th>
                      <th className="px-3 py-2">Jam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((schedule) => (
                      <tr key={schedule.id} className="border-t">
                        <td className="px-3 py-2">{dayNames[schedule.dayOfWeek] ?? schedule.dayOfWeek}</td>
                        <td className="px-3 py-2">{schedule.subjectName}</td>
                        <td className="px-3 py-2">{schedule.teacherName}</td>
                        <td className="px-3 py-2">{schedule.startTime} - {schedule.endTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Tryout</h2>
              <a href="/tryout" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Buka TryOut</a>
            </div>
            {tryouts.length === 0 ? (
              <p className="mt-4 text-slate-500">Belum ada tryout yang dibuka.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {tryouts.map((tryout) => (
                  <div key={tryout.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{tryout.title}</p>
                        <p className="text-xs text-slate-500">{tryout.durationMinutes} menit</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase ${tryout.isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {tryout.message}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Materi PDF</h2>
            {materials.length === 0 ? (
              <p className="mt-4 text-slate-500">Belum ada materi PDF yang tersedia.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {materials.map((material) => (
                  <div key={material.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{material.title}</p>
                        <p className="text-xs text-slate-500">Minggu {material.weekNumber} · {material.subjectName}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase ${material.isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {material.message}
                      </span>
                    </div>
                    {material.isOpen ? <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => void openProtectedResource(`/api/content/materials/${material.id}/file`)} className="text-sm">Lihat PDF</button>
                      <button type="button" onClick={() => void openProtectedResource(`/api/content/materials/${material.id}/file`, true)} className="bg-slate-700 text-sm hover:bg-slate-800">Unduh PDF</button>
                    </div> : <p className="mt-3 text-sm font-medium text-amber-700">{material.message}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Video Belajar</h2>
            {videos.length === 0 ? (
              <p className="mt-4 text-slate-500">Belum ada video yang tersedia.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {videos.map((video) => (
                  <div key={video.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{video.title}</p>
                        <p className="text-xs text-slate-500">Minggu {video.weekNumber} · {video.subjectName}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase ${video.isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {video.message}
                      </span>
                    </div>
                    {video.isOpen && video.fileUrl ? <a href={video.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700">Tonton video</a> : <p className="mt-3 text-sm font-medium text-amber-700">{video.message}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="hasil-tryout" className="scroll-mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Hasil Tryout &amp; Sertifikat</h2>
              <p className="mt-1 text-sm text-slate-500">Nilai, pembahasan jawaban, dan sertifikat tersedia setelah tryout dikumpulkan.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
              {tryoutResults.length} selesai
            </span>
          </div>
          {tryoutResults.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Belum ada tryout yang selesai. Setelah mengumpulkan jawaban, hasil dan sertifikat akan muncul di sini.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {tryoutResults.map((result) => (
                <article key={result.attemptId} className="rounded-xl border border-slate-200 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Selesai</span>
                        <span className="text-xs text-slate-500">{formatTryoutDate(result.submittedAt)}</span>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-slate-900">{result.title}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        Nilai <strong>{result.score}</strong> / {result.maxScore}
                        <span className="mx-2 text-slate-300">|</span>
                        Benar {result.correctCount} dari {result.questionCount}
                        <span className="mx-2 text-slate-300">|</span>
                        Dijawab {result.answeredCount} dari {result.questionCount}
                      </p>
                    </div>
                    {result.certificateEnabled && (result.maxScore > 0 ? result.score / result.maxScore * 100 : 0) >= result.certificateMinimumScore ? (
                      <button type="button" onClick={() => printCertificate(result)} className="shrink-0 bg-amber-500 hover:bg-amber-600">
                        Cetak / Simpan Sertifikat (PDF)
                      </button>
                    ) : (
                      <p className="shrink-0 text-sm text-slate-500">
                        {result.certificateEnabled
                          ? `Sertifikat tersedia mulai nilai ${result.certificateMinimumScore}%.`
                          : 'Sertifikat tidak diaktifkan untuk TryOut ini.'}
                      </p>
                    )}
                  </div>

                  <details
                    className="mt-4 border-t border-slate-100 pt-4"
                    onToggle={(event) => toggleTryoutResult(result.attemptId, event.currentTarget.open)}
                  >
                    <summary className="cursor-pointer font-semibold text-blue-700">Lihat hasil &amp; pembahasan</summary>
                    <div className="mt-4 space-y-3">
                      {loadingTryoutResults[result.attemptId] ? (
                        <p className="text-sm text-slate-500">Memuat pembahasan...</p>
                      ) : tryoutResultErrors[result.attemptId] ? (
                        <div>
                          <p role="alert" className="text-sm text-red-700">{tryoutResultErrors[result.attemptId]}</p>
                          <button type="button" onClick={() => void loadTryoutResultDetails(result.attemptId)} className="mt-2 text-sm">
                            Coba lagi
                          </button>
                        </div>
                      ) : tryoutResultDetails[result.attemptId]?.questions.map((question, index) => (
                        <div key={question.id} className="rounded-xl bg-slate-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-semibold">Soal {index + 1}</h4>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              question.isCorrect
                                ? 'bg-emerald-100 text-emerald-700'
                                : question.selectedAnswer === null
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-rose-100 text-rose-700'
                            }`}>
                              {question.isCorrect ? 'Benar' : question.selectedAnswer === null ? 'Tidak dijawab' : 'Belum tepat'}
                            </span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{question.text}</p>
                          {question.imageUrl ? <img src={question.imageUrl} alt={`Ilustrasi soal ${index + 1}`} className="mt-3 max-h-64 rounded-lg object-contain" /> : null}
                          <ul className="mt-3 space-y-2 text-sm">
                            {question.options.map((option, optionIndex) => {
                              const selectedAnswers = toAnswerList(question.selectedAnswer);
                              const correctAnswers = toAnswerList(question.correctAnswer);
                              return (
                              <li
                                key={`${question.id}-${optionIndex}`}
                                className={`rounded-lg border px-3 py-2 ${
                                  correctAnswers.includes(option)
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                    : selectedAnswers.includes(option)
                                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                                      : 'border-slate-200 bg-white text-slate-700'
                                }`}
                              >
                                <span className="font-semibold">{String.fromCharCode(65 + optionIndex)}.</span> {option}
                                {correctAnswers.includes(option) ? <span className="ml-2 text-xs font-semibold">(Jawaban benar)</span> : null}
                                {selectedAnswers.includes(option) ? <span className="ml-2 text-xs">(Jawaban Anda)</span> : null}
                              </li>
                              );
                            })}
                          </ul>
                          {question.explanation ? (
                            <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                              <strong>Pembahasan:</strong> {question.explanation}
                            </p>
                          ) : null}
                          {question.explanationImageUrl ? (
                            explanationImageUrls[question.id]
                              ? <img src={explanationImageUrls[question.id]} alt={`Gambar pembahasan soal ${index + 1}`} className="mt-3 max-h-80 rounded-lg border border-slate-200 object-contain" />
                              : <p className="mt-3 text-xs text-slate-500">Memuat gambar pembahasan...</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

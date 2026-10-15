'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';

type TryoutItem = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  isOpen: boolean;
  message: string;
};

type ExamQuestion = {
  id: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  text: string;
  imageUrl: string | null;
  options: string[];
  selectedAnswer: string | string[] | null;
};

type ExamAttempt = {
  attemptId: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED';
  remainingSeconds: number;
  questions: ExamQuestion[];
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remaining = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

export default function TryoutPage() {
  const [tryouts, setTryouts] = useState<TryoutItem[]>([]);
  const [activeTryout, setActiveTryout] = useState<TryoutItem | null>(null);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [accessCodes, setAccessCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submitInProgress = useRef(false);

  useEffect(() => {
    async function loadTryouts() {
      try {
        const result = await apiRequest<{ data: TryoutItem[] }>('/api/siswa/tryouts');
        setTryouts(result.data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Gagal memuat TryOut.');
      } finally {
        setLoading(false);
      }
    }
    void loadTryouts();
  }, []);

  const submitAttempt = useCallback(async () => {
    if (!activeTryout || !attempt || attempt.status !== 'IN_PROGRESS' || submitInProgress.current) return;
    submitInProgress.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await apiRequest<{ data: { score: number; status: 'SUBMITTED' } }>(`/api/siswa/tryouts/${activeTryout.id}/submit`, {
        method: 'POST'
      });
      setScore(result.data.score);
      setAttempt((current) => current ? { ...current, status: result.data.status } : current);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'TryOut gagal dikumpulkan.');
      submitInProgress.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [activeTryout, attempt]);

  useEffect(() => {
    if (!attempt || attempt.status !== 'IN_PROGRESS') return;
    const timer = window.setInterval(() => {
      setAttempt((current) => current
        ? { ...current, remainingSeconds: Math.max(0, current.remainingSeconds - 1) }
        : current
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.attemptId, attempt?.status]);

  useEffect(() => {
    if (attempt?.status === 'IN_PROGRESS' && attempt.remainingSeconds === 0) {
      void submitAttempt();
    }
  }, [attempt?.remainingSeconds, attempt?.status, submitAttempt]);

  async function startTryout(item: TryoutItem) {
    setLoading(true);
    setError('');
    setScore(null);
    try {
      await apiRequest(`/api/siswa/tryouts/${item.id}/start`, {
        method: 'POST',
        body: JSON.stringify({ accessCode: accessCodes[item.id]?.trim() ?? '' })
      });
      const result = await apiRequest<{ data: ExamAttempt }>(`/api/siswa/tryouts/${item.id}/attempt`);
      setActiveTryout(item);
      setAttempt(result.data);
      submitInProgress.current = false;
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'TryOut gagal dimulai.');
    } finally {
      setLoading(false);
    }
  }

  async function selectAnswer(questionId: string, selectedOption: string) {
    if (!activeTryout || !attempt || savingAnswer || attempt.status !== 'IN_PROGRESS') return;
    const question = attempt.questions.find((item) => item.id === questionId);
    if (!question) return;
    const selectedAnswer = question.type === 'MULTIPLE_CHOICE'
      ? (() => {
        const current = Array.isArray(question.selectedAnswer) ? question.selectedAnswer : [];
        return current.includes(selectedOption)
          ? current.filter((option) => option !== selectedOption)
          : [...current, selectedOption];
      })()
      : selectedOption;
    setError('');
    setAttempt((current) => current ? {
      ...current,
      questions: current.questions.map((question) => question.id === questionId ? { ...question, selectedAnswer } : question)
    } : current);
    setSavingAnswer(true);
    try {
      await apiRequest(`/api/siswa/tryouts/${activeTryout.id}/answers`, {
        method: 'POST',
        body: JSON.stringify({ questionId, selectedAnswer })
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Jawaban gagal disimpan. Silakan pilih kembali.');
    } finally {
      setSavingAnswer(false);
    }
  }

  if (activeTryout && attempt) {
    const submitted = attempt.status === 'SUBMITTED';
    return (
      <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-950 p-6 text-white shadow-lg">
            <div>
              <a href="/dashboard/siswa" className="text-sm text-slate-300 underline hover:text-white">Kembali ke dashboard</a>
              <p className="text-sm text-slate-300">TryOut CBT</p>
              <h1 className="mt-1 text-2xl font-bold">{activeTryout.title}</h1>
            </div>
            {!submitted ? (
              <div aria-live="polite" className="rounded-xl bg-white/10 px-4 py-2 text-xl font-bold tabular-nums">
                Sisa waktu {formatTime(attempt.remainingSeconds)}
              </div>
            ) : null}
          </header>

          {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          {submitted ? (
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">TryOut selesai</h2>
              <p className="mt-2 text-slate-600">Nilai Anda: <strong>{score ?? '-'}</strong></p>
              <p className="mt-2 text-sm text-slate-500">Hasil, pembahasan, dan sertifikat dapat dilihat dari dashboard siswa.</p>
              <a href="/dashboard/siswa#hasil-tryout" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">Lihat hasil &amp; sertifikat</a>
            </section>
          ) : (
            <>
              <div className="space-y-4">
                {attempt.questions.map((question, index) => (
                  <section key={question.id} className="rounded-2xl bg-white p-5 shadow-sm">
                    <h2 className="font-semibold">Soal {index + 1}</h2>
                    {question.type === 'MULTIPLE_CHOICE' ? <p className="mt-1 text-xs text-slate-500">Pilih semua jawaban yang benar.</p> : null}
                    <p className="mt-3 whitespace-pre-wrap text-slate-800">{question.text}</p>
                    {question.imageUrl ? <img src={question.imageUrl} alt={`Ilustrasi soal ${index + 1}`} className="mt-3 max-h-72 rounded-lg object-contain" /> : null}
                    <div className="mt-4 space-y-2">
                      {question.options.map((option, optionIndex) => (
                        <label key={`${question.id}-${optionIndex}`} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                          <input
                            type={question.type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
                            name={question.id}
                            checked={Array.isArray(question.selectedAnswer)
                              ? question.selectedAnswer.includes(option)
                              : question.selectedAnswer === option}
                            onChange={() => void selectAnswer(question.id, option)}
                            disabled={savingAnswer}
                            className="mt-1"
                          />
                          <span><strong className="mr-2">{String.fromCharCode(65 + optionIndex)}.</strong>{option}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">{savingAnswer ? 'Menyimpan jawaban...' : 'Jawaban tersimpan otomatis.'}</p>
                <button type="button" onClick={() => void submitAttempt()} disabled={submitting || savingAnswer} className="disabled:opacity-50">
                  {submitting ? 'Mengumpulkan...' : 'Kumpulkan jawaban'}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">TryOut CBT</h1>
        <p className="mt-2 text-slate-600">Pilih TryOut yang tersedia untuk mulai mengerjakan soal.</p>
        <a href="/dashboard/siswa" className="mt-3 inline-flex font-semibold text-blue-600 hover:text-blue-700">← Kembali ke dashboard</a>

        {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 grid gap-4">
          {loading ? <p>Memuat TryOut...</p> : tryouts.length === 0 ? (
            <p className="text-slate-500">Belum ada TryOut yang tersedia.</p>
          ) : tryouts.map((item) => (
            <div key={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xl font-semibold">{item.title}</p>
                  <p className="text-sm text-slate-500">Durasi: {item.durationMinutes} menit</p>
                  <p className="mt-2 text-sm text-slate-600">Mulai: {new Date(item.startAt).toLocaleString('id-ID')}</p>
                  <p className="text-sm text-slate-600">Selesai: {new Date(item.endAt).toLocaleString('id-ID')}</p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${item.isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {item.message}
                  </span>
                  {item.isOpen ? (
                    <div className="flex flex-col items-end gap-2">
                      <label className="text-left text-sm text-slate-600">
                        Kode akses
                        <input
                          value={accessCodes[item.id] ?? ''}
                          onChange={(event) => setAccessCodes((current) => ({ ...current, [item.id]: event.target.value.toUpperCase() }))}
                          placeholder="Masukkan kode dari guru"
                          autoComplete="off"
                          className="mt-1 w-52"
                        />
                      </label>
                      <button type="button" onClick={() => void startTryout(item)} disabled={loading || !accessCodes[item.id]?.trim()}>
                        {loading ? 'Memproses...' : 'Mulai TryOut'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

type ClassItem = { id: string; name: string };
type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
type QuestionDraft = {
  text: string;
  type: QuestionType;
  options: string[];
  correctOptions: string[];
  points: string;
  explanation: string;
  explanationImage: File | null;
};
type TryoutItem = {
  id: string;
  title: string;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  className: string;
  questionCount: number;
  accessCode: string;
  certificateEnabled: boolean;
  certificateMinimumScore: number;
  certificateSignerName: string;
  certificateSignerTitle: string;
};

function toDateTimeInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function createQuestion(): QuestionDraft {
  return {
    text: '',
    type: 'SINGLE_CHOICE',
    options: ['', '', '', ''],
    correctOptions: ['0'],
    points: '1',
    explanation: '',
    explanationImage: null
  };
}

export default function TryoutsSection({ classes }: { classes: ClassItem[] }) {
  const [tryouts, setTryouts] = useState<TryoutItem[]>([]);
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [certificateEnabled, setCertificateEnabled] = useState(true);
  const [certificateMinimumScore, setCertificateMinimumScore] = useState('0');
  const [certificateSignerName, setCertificateSignerName] = useState('');
  const [certificateSignerTitle, setCertificateSignerTitle] = useState('');
  const [editingCertificateId, setEditingCertificateId] = useState<string | null>(null);
  const [editingCertificateEnabled, setEditingCertificateEnabled] = useState(true);
  const [editingCertificateMinimumScore, setEditingCertificateMinimumScore] = useState('0');
  const [editingCertificateSignerName, setEditingCertificateSignerName] = useState('');
  const [editingCertificateSignerTitle, setEditingCertificateSignerTitle] = useState('');
  const [startAt, setStartAt] = useState(() => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + 5);
    return toDateTimeInput(date);
  });
  const [endAt, setEndAt] = useState(() => {
    const date = new Date();
    date.setHours(date.getHours() + 2);
    return toDateTimeInput(date);
  });
  const [questions, setQuestions] = useState<QuestionDraft[]>([createQuestion()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadTryouts() {
    try {
      const response = await apiRequest<{ data: TryoutItem[] }>('/api/admin/tryouts');
      setTryouts(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat daftar TryOut.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTryouts();
  }, []);

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classId, classes]);

  function updateQuestion(index: number, update: Partial<QuestionDraft>) {
    setQuestions((current) => current.map((question, questionIndex) =>
      questionIndex === index ? { ...question, ...update } : question
    ));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      return { ...question, options: question.options.map((option, itemIndex) => itemIndex === optionIndex ? value : option) };
    }));
  }

  function toggleCorrectOption(questionIndex: number, optionIndex: number) {
    const option = String(optionIndex);
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      const correctOptions = question.correctOptions.includes(option)
        ? question.correctOptions.filter((item) => item !== option)
        : [...question.correctOptions, option];
      return { ...question, correctOptions };
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const formData = new FormData();
      let imageCount = 0;
      const questionPayload = questions.map((question) => {
        const options = question.options.map((option) => option.trim()).filter(Boolean);
        const correctAnswers = question.correctOptions
          .map(Number)
          .map((optionIndex) => question.options[optionIndex]?.trim())
          .filter((option): option is string => Boolean(option));
        const explanationImageIndex = question.explanationImage ? imageCount++ : undefined;

        if (question.explanationImage) {
          formData.append('explanationImages', question.explanationImage);
        }

        return {
          type: question.type,
          text: question.text.trim(),
          options,
          correctAnswer: question.type === 'SINGLE_CHOICE'
            ? correctAnswers[0] ?? ''
            : JSON.stringify(correctAnswers),
          points: Number(question.points),
          explanation: question.explanation.trim() || undefined,
          ...(explanationImageIndex === undefined ? {} : { explanationImageIndex })
        };
      });
      formData.append('payload', JSON.stringify({
        title,
        classId,
        durationMinutes: Number(durationMinutes),
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        certificateEnabled,
        certificateMinimumScore: Number(certificateMinimumScore),
        certificateSignerName,
        certificateSignerTitle,
        questions: questionPayload
      }));

      await apiRequest('/api/admin/tryouts', {
        method: 'POST',
        body: formData
      });

      setMessage('TryOut beserta soal berhasil ditambahkan untuk kelas yang dipilih.');
      setTitle('');
      setQuestions([createQuestion()]);
      setCertificateEnabled(true);
      setCertificateMinimumScore('0');
      setCertificateSignerName('');
      setCertificateSignerTitle('');
      await loadTryouts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'TryOut gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  function editCertificateSettings(tryout: TryoutItem) {
    setEditingCertificateId(tryout.id);
    setEditingCertificateEnabled(tryout.certificateEnabled);
    setEditingCertificateMinimumScore(String(tryout.certificateMinimumScore));
    setEditingCertificateSignerName(tryout.certificateSignerName);
    setEditingCertificateSignerTitle(tryout.certificateSignerTitle);
  }

  async function saveCertificateSettings(tryoutId: string) {
    setSaving(true);
    setMessage('');
    try {
      await apiRequest(`/api/admin/tryouts/${tryoutId}/certificate`, {
        method: 'PATCH',
        body: JSON.stringify({
          certificateEnabled: editingCertificateEnabled,
          certificateMinimumScore: Number(editingCertificateMinimumScore),
          certificateSignerName: editingCertificateSignerName,
          certificateSignerTitle: editingCertificateSignerTitle
        })
      });
      setMessage('Pengaturan sertifikat berhasil disimpan.');
      setEditingCertificateId(null);
      await loadTryouts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pengaturan sertifikat gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div>
        <h2 className="text-xl font-bold text-slate-900">TryOut &amp; Soal</h2>
        <p className="mt-1 text-sm text-slate-500">Buat jadwal ujian dan bagikan kode akses kepada siswa yang berhak mengerjakan.</p>
      </div>

      {message ? <p role="status" className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</p> : null}

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm text-slate-600">
            Nama TryOut
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: TryOut Matematika" className="mt-1 w-full" minLength={2} required />
          </label>
          <label className="text-sm text-slate-600">
            Kelas
            <select value={classId} onChange={(event) => setClassId(event.target.value)} className="mt-1 w-full" required disabled={classes.length === 0}>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Durasi (menit)
            <input type="number" min="1" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} className="mt-1 w-full" required />
          </label>
          <label className="text-sm text-slate-600">
            Mulai
            <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="mt-1 w-full" required />
          </label>
          <label className="text-sm text-slate-600">
            Selesai
            <input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className="mt-1 w-full" required />
          </label>
        </div>

        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 font-semibold text-slate-800">Sertifikat</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={certificateEnabled} onChange={(event) => setCertificateEnabled(event.target.checked)} />
            Aktifkan sertifikat untuk TryOut ini
          </label>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-sm text-slate-600">
              Nilai minimum (%)
              <input type="number" min="0" max="100" step="1" value={certificateMinimumScore} onChange={(event) => setCertificateMinimumScore(event.target.value)} className="mt-1 w-full" required />
            </label>
            <label className="text-sm text-slate-600">
              Nama penandatangan (opsional)
              <input value={certificateSignerName} onChange={(event) => setCertificateSignerName(event.target.value)} maxLength={120} className="mt-1 w-full" />
            </label>
            <label className="text-sm text-slate-600">
              Jabatan (opsional)
              <input value={certificateSignerTitle} onChange={(event) => setCertificateSignerTitle(event.target.value)} maxLength={120} className="mt-1 w-full" />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">Siswa dapat mencetak sertifikat jika nilainya mencapai persentase minimum.</p>
        </fieldset>

        <div className="space-y-4">
          {questions.map((question, questionIndex) => (
            <fieldset key={questionIndex} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <legend className="font-semibold text-slate-800">Soal {questionIndex + 1}</legend>
                {questions.length > 1 ? (
                  <button type="button" onClick={() => setQuestions((current) => current.filter((_, index) => index !== questionIndex))} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
                    Hapus soal
                  </button>
                ) : null}
              </div>
              <label className="mt-3 block text-sm text-slate-600">
                Pertanyaan
                <textarea value={question.text} onChange={(event) => updateQuestion(questionIndex, { text: event.target.value })} className="mt-1 min-h-20 w-full" minLength={2} required />
              </label>
              <label className="mt-3 block text-sm text-slate-600">
                Tipe soal
                <select
                  value={question.type}
                  onChange={(event) => {
                    const type = event.target.value as QuestionType;
                    updateQuestion(questionIndex, {
                      type,
                      correctOptions: type === 'SINGLE_CHOICE' ? question.correctOptions.slice(0, 1) : question.correctOptions
                    });
                  }}
                  className="mt-1 w-full"
                >
                  <option value="SINGLE_CHOICE">Pilihan ganda (satu jawaban)</option>
                  <option value="MULTIPLE_CHOICE">Pilihan ganda kompleks (lebih dari satu jawaban)</option>
                </select>
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {question.options.map((option, optionIndex) => (
                  <label key={optionIndex} className="text-sm text-slate-600">
                    Pilihan {String.fromCharCode(65 + optionIndex)}
                    <input value={option} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} className="mt-1 w-full" required />
                  </label>
                ))}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <fieldset className="text-sm text-slate-600">
                  <legend>{question.type === 'MULTIPLE_CHOICE' ? 'Jawaban benar (pilih semua yang benar)' : 'Jawaban benar'}</legend>
                  <div className="mt-2 space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <label key={optionIndex} className="flex items-center gap-2">
                        <input
                          type={question.type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
                          name={`correct-answer-${questionIndex}`}
                          checked={question.correctOptions.includes(String(optionIndex))}
                          onChange={() => {
                            if (question.type === 'MULTIPLE_CHOICE') {
                              toggleCorrectOption(questionIndex, optionIndex);
                            } else {
                              updateQuestion(questionIndex, { correctOptions: [String(optionIndex)] });
                            }
                          }}
                          className="h-4 w-4"
                        />
                        Pilihan {String.fromCharCode(65 + optionIndex)}
                      </label>
                    ))}
                  </div>
                  {question.type === 'MULTIPLE_CHOICE' && question.correctOptions.length < 2 ? (
                    <p className="mt-2 text-xs text-amber-700">Pilih minimal dua jawaban benar.</p>
                  ) : null}
                </fieldset>
                <label className="text-sm text-slate-600">
                  Bobot nilai
                  <input type="number" min="1" value={question.points} onChange={(event) => updateQuestion(questionIndex, { points: event.target.value })} className="mt-1 w-full" required />
                </label>
              </div>
              <label className="mt-3 block text-sm text-slate-600">
                Pembahasan (opsional)
                <textarea value={question.explanation} onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })} className="mt-1 min-h-16 w-full" />
              </label>
              <label className="mt-3 block text-sm text-slate-600">
                Gambar pembahasan (opsional, PNG/JPEG/WebP, maks. 5 MB)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => updateQuestion(questionIndex, { explanationImage: event.target.files?.[0] ?? null })}
                  className="mt-1 w-full"
                />
                {question.explanationImage ? <span className="mt-1 block text-xs text-slate-500">{question.explanationImage.name}</span> : null}
              </label>
            </fieldset>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setQuestions((current) => [...current, createQuestion()])} className="bg-slate-100 text-slate-800 hover:bg-slate-200">
            Tambah soal
          </button>
          <button type="submit" disabled={saving || classes.length === 0} className="disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan TryOut'}
          </button>
        </div>
      </form>

      <div className="mt-8 border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-slate-900">TryOut yang sudah dibuat</h3>
        {loading ? <p className="mt-3 text-sm text-slate-500">Memuat daftar TryOut...</p> : tryouts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Belum ada TryOut.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {tryouts.map((tryout) => (
              <div key={tryout.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-800">{tryout.title}</p>
                  <p className="text-sm text-slate-500">{tryout.className} · {tryout.questionCount} soal · {tryout.durationMinutes} menit</p>
                  <p className="mt-1 text-sm font-semibold text-blue-700">Kode akses: <span className="font-mono tracking-wider">{tryout.accessCode}</span></p>
                  <p className="mt-1 text-xs text-slate-600">
                    Sertifikat {tryout.certificateEnabled ? `aktif · minimum ${tryout.certificateMinimumScore}%` : 'nonaktif'}
                    {tryout.certificateSignerName ? ` · ${tryout.certificateSignerName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-500">{new Date(tryout.startAt).toLocaleString('id-ID')}</p>
                  <button type="button" onClick={() => editCertificateSettings(tryout)} className="bg-slate-200 text-sm text-slate-800 hover:bg-slate-300">
                    Atur sertifikat
                  </button>
                </div>
                {editingCertificateId === tryout.id ? (
                  <div className="w-full space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={editingCertificateEnabled} onChange={(event) => setEditingCertificateEnabled(event.target.checked)} />
                      Aktifkan sertifikat
                    </label>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="text-sm text-slate-600">
                        Nilai minimum (%)
                        <input type="number" min="0" max="100" step="1" value={editingCertificateMinimumScore} onChange={(event) => setEditingCertificateMinimumScore(event.target.value)} className="mt-1 w-full" required />
                      </label>
                      <label className="text-sm text-slate-600">
                        Nama penandatangan
                        <input value={editingCertificateSignerName} onChange={(event) => setEditingCertificateSignerName(event.target.value)} maxLength={120} className="mt-1 w-full" />
                      </label>
                      <label className="text-sm text-slate-600">
                        Jabatan
                        <input value={editingCertificateSignerTitle} onChange={(event) => setEditingCertificateSignerTitle(event.target.value)} maxLength={120} className="mt-1 w-full" />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void saveCertificateSettings(tryout.id)} disabled={saving} className="disabled:opacity-50">
                        {saving ? 'Menyimpan...' : 'Simpan pengaturan'}
                      </button>
                      <button type="button" onClick={() => setEditingCertificateId(null)} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
                        Batal
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

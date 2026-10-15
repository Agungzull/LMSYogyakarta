'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest, openProtectedResource } from '@/lib/api';
import LogoutButton from '@/components/logout-button';

type Schedule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  className: string;
  subjectName: string;
};

type AttendanceStudent = {
  studentId: string;
  nis: string;
  name: string;
  status: 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPA' | null;
  note: string | null;
};

type AttendanceData = {
  schedule: {
    id: string;
    className: string;
    subjectId: string;
    teacherId: string;
  };
  students: AttendanceStudent[];
};

type Score = {
  id: string;
  date: string;
  score: number;
  activityScore: number | null;
  note: string | null;
  subjectName: string;
  studentName: string;
  className: string | null;
};

type Material = {
  id: string;
  title: string;
  type: 'PDF' | 'VIDEO';
  fileUrl: string;
  weekNumber: number;
  subjectName: string;
  className: string;
  availableFrom: string;
  availableUntil: string;
};

type ResetRequest = {
  id: string;
  status: string;
  createdAt: string;
  student: {
    id: string;
    name: string;
    nis: string;
    className: string | null;
  };
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

const attendanceOptions = ['HADIR', 'IZIN', 'SAKIT', 'ALPA'] as const;

function formatDateLabel(value: string) {
  if (!value) return 'Belum diisi';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

export default function GuruDashboardPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attendanceData, setAttendanceData] = useState<AttendanceData | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, { status: string; note: string }>>({});
  const [dailyScores, setDailyScores] = useState<Score[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [resetRequests, setResetRequests] = useState<ResetRequest[]>([]);
  const [feedback, setFeedback] = useState('');
  const [scoreForm, setScoreForm] = useState({
    studentId: '',
    subjectId: '',
    date: new Date().toISOString().slice(0, 10),
    score: '',
    activityScore: '',
    note: ''
  });
  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedSchedule = useMemo(
    () => schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null,
    [schedules, selectedScheduleId]
  );

  useEffect(() => {
    async function loadInitial() {
      try {
        const [scheduleResult, materialResult, scoreResult, resetResult] = await Promise.all([
          apiRequest<{ data: Schedule[] }>('/api/guru/schedules'),
          apiRequest<{ data: Material[] }>('/api/guru/materials'),
          apiRequest<{ data: Score[] }>('/api/guru/daily-scores'),
          apiRequest<{ data: ResetRequest[] }>('/api/guru/reset-requests')
        ]);

        setSchedules(scheduleResult.data);
        setMaterials(materialResult.data);
        setDailyScores(scoreResult.data);
        setResetRequests(resetResult.data);

        if (scheduleResult.data.length > 0) {
          setSelectedScheduleId(scheduleResult.data[0].id);
        }
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Gagal memuat data dashboard guru.');
      } finally {
        setLoading(false);
      }
    }

    loadInitial();
  }, []);

  useEffect(() => {
    if (!selectedScheduleId) return;

    async function loadAttendance() {
      try {
        setAttendanceLoading(true);
        const result = await apiRequest<{ data: AttendanceData }>('/api/guru/attendance?scheduleId=' + encodeURIComponent(selectedScheduleId) + '&date=' + encodeURIComponent(attendanceDate));
        setAttendanceData(result.data);

        const nextRecords: Record<string, { status: string; note: string }> = {};
        result.data.students.forEach((student) => {
          nextRecords[student.studentId] = {
            status: student.status ?? 'HADIR',
            note: student.note ?? ''
          };
        });
        setAttendanceRecords(nextRecords);

        if (result.data.schedule.subjectId) {
          setScoreForm((prev) => ({
            ...prev,
            subjectId: result.data.schedule.subjectId,
            date: prev.date || attendanceDate
          }));
        }
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Gagal memuat data absensi.');
      } finally {
        setAttendanceLoading(false);
      }
    }

    loadAttendance();
  }, [attendanceDate, selectedScheduleId]);

  useEffect(() => {
    if (!attendanceData || attendanceData.students.length === 0) return;
    setScoreForm((prev) => ({
      ...prev,
      studentId: prev.studentId || attendanceData.students[0].studentId
    }));
  }, [attendanceData]);

  async function handleAttendanceSave() {
    if (!selectedScheduleId) return;

    setSavingAttendance(true);
    setStatusMessage(null);

    try {
      const records = Object.entries(attendanceRecords).map(([studentId, value]) => ({
        studentId,
        status: value.status,
        note: value.note || undefined
      }));

      await apiRequest('/api/guru/attendance', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: selectedScheduleId,
          date: attendanceDate,
          records
        })
      });

      setStatusMessage('Absensi berhasil disimpan.');
    } catch (error) {
      console.error(error);
      setStatusMessage(error instanceof Error ? error.message : 'Gagal menyimpan absensi.');
    } finally {
      setSavingAttendance(false);
    }
  }

  async function handleScoreSave() {
    if (!scoreForm.studentId || !scoreForm.subjectId || !scoreForm.score || !scoreForm.activityScore) {
      setStatusMessage('Pilih siswa, mata pelajaran, nilai, dan keaktifan sebelum menyimpan.');
      return;
    }

    setSavingScore(true);
    setStatusMessage(null);

    try {
      await apiRequest('/api/guru/daily-scores', {
        method: 'POST',
        body: JSON.stringify({
          studentId: scoreForm.studentId,
          subjectId: scoreForm.subjectId,
          date: scoreForm.date,
          score: Number(scoreForm.score),
          activityScore: Number(scoreForm.activityScore),
          note: scoreForm.note || undefined
        })
      });

      const refreshed = await apiRequest<{ data: Score[] }>('/api/guru/daily-scores');
      setDailyScores(refreshed.data);
      setStatusMessage('Nilai harian berhasil disimpan.');
      setScoreForm((prev) => ({ ...prev, score: '', activityScore: '', note: '' }));
    } catch (error) {
      console.error(error);
      setStatusMessage(error instanceof Error ? error.message : 'Gagal menyimpan nilai.');
    } finally {
      setSavingScore(false);
    }
  }

  async function handleResetRequest(id: string, nextStatus: 'APPROVED' | 'REJECTED') {
    try {
      const result = await apiRequest<{ data: { temporaryPassword?: string } }>(`/api/guru/reset-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });

      const refreshed = await apiRequest<{ data: ResetRequest[] }>('/api/guru/reset-requests');
      setResetRequests(refreshed.data);

      const temporaryPassword = result.data?.temporaryPassword;
      setStatusMessage(
        nextStatus === 'APPROVED'
          ? `Permintaan disetujui. Password sementara untuk siswa: ${temporaryPassword ?? '(tidak tersedia)'} — sampaikan langsung dan minta diganti saat login pertama.`
          : 'Permintaan reset password ditolak.'
      );
    } catch (error) {
      console.error(error);
      setStatusMessage(error instanceof Error ? error.message : 'Gagal memproses permintaan.');
    }
  }

  async function handleFeedbackSubmit() {
    if (!feedback.trim()) {
      setStatusMessage('Pesan feedback tidak boleh kosong.');
      return;
    }

    setSendingFeedback(true);
    setStatusMessage(null);

    try {
      await apiRequest('/api/guru/feedback', {
        method: 'POST',
        body: JSON.stringify({ message: feedback })
      });

      setFeedback('');
      setStatusMessage('Feedback berhasil dikirim.');
    } catch (error) {
      console.error(error);
      setStatusMessage(error instanceof Error ? error.message : 'Gagal mengirim feedback.');
    } finally {
      setSendingFeedback(false);
    }
  }

  return (
    <main className="p-8 bg-slate-100 min-h-screen text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 p-8 text-white shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-100">Guru</p>
              <h1 className="mt-2 text-3xl font-bold">Dashboard Guru</h1>
              <p className="mt-2 max-w-2xl text-emerald-50">
                Kelola jadwal, absensi, nilai harian, materi, dan monitoring reset password siswa.
              </p>
            </div>
            <LogoutButton />
          </div>
        </header>

        {statusMessage && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {statusMessage}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Jadwal</p>
            <p className="mt-3 text-3xl font-bold">{schedules.length}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Nilai hari ini</p>
            <p className="mt-3 text-3xl font-bold">{dailyScores.length}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Reset request</p>
            <p className="mt-3 text-3xl font-bold">{resetRequests.length}</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Jadwal Mengajar</h2>
            </div>

            {loading ? (
              <p>Memuat jadwal...</p>
            ) : schedules.length === 0 ? (
              <p className="text-slate-500">Belum ada jadwal yang ditugaskan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-600">
                      <th className="pb-3">Hari</th>
                      <th className="pb-3">Mapel</th>
                      <th className="pb-3">Kelas</th>
                      <th className="pb-3">Jam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((item) => (
                      <tr
                        key={item.id}
                        className={`cursor-pointer border-b last:border-0 ${selectedScheduleId === item.id ? 'bg-emerald-50' : ''}`}
                        onClick={() => setSelectedScheduleId(item.id)}
                      >
                        <td className="py-3">{dayNames[item.dayOfWeek] ?? item.dayOfWeek}</td>
                        <td className="py-3">{item.subjectName}</td>
                        <td className="py-3">{item.className}</td>
                        <td className="py-3">{item.startTime} - {item.endTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Materi & Video</h2>
            {materials.length === 0 ? (
              <p className="mt-4 text-slate-500">Belum ada materi yang dibagikan.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {materials.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-xs text-slate-500">Minggu {item.weekNumber} • {item.subjectName} • {item.className}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {item.type}
                      </span>
                    </div>
                    {item.type === 'PDF' ? <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => void openProtectedResource(`/api/content/materials/${item.id}/file`)} className="text-sm">Lihat PDF</button>
                      <button type="button" onClick={() => void openProtectedResource(`/api/content/materials/${item.id}/file`, true)} className="bg-slate-700 text-sm hover:bg-slate-800">Unduh PDF</button>
                    </div> : <a href={item.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700">Tonton video</a>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Absensi Siswa</h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Tanggal</label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(event) => setAttendanceDate(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {selectedSchedule ? (
              <>
                <p className="mb-4 text-sm text-slate-600">
                  {selectedSchedule.subjectName} • {selectedSchedule.className}
                </p>

                {attendanceLoading ? (
                  <p>Memuat daftar siswa...</p>
                ) : attendanceData && attendanceData.students.length > 0 ? (
                  <div className="space-y-3">
                    {attendanceData.students.map((student) => (
                      <div key={student.studentId} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium">{student.name}</p>
                            <p className="text-xs text-slate-500">NIS: {student.nis}</p>
                          </div>
                          <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <select
                              value={attendanceRecords[student.studentId]?.status ?? 'HADIR'}
                              onChange={(event) =>
                                setAttendanceRecords((prev) => ({
                                  ...prev,
                                  [student.studentId]: {
                                    status: event.target.value,
                                    note: prev[student.studentId]?.note ?? ''
                                  }
                                }))
                              }
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            >
                              {attendanceOptions.map((status) => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Catatan"
                              value={attendanceRecords[student.studentId]?.note ?? ''}
                              onChange={(event) =>
                                setAttendanceRecords((prev) => ({
                                  ...prev,
                                  [student.studentId]: {
                                    status: prev[student.studentId]?.status ?? 'HADIR',
                                    note: event.target.value
                                  }
                                }))
                              }
                              className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={handleAttendanceSave}
                      disabled={savingAttendance}
                      className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {savingAttendance ? 'Menyimpan...' : 'Simpan Absensi'}
                    </button>
                  </div>
                ) : (
                  <p className="text-slate-500">Belum ada siswa di kelas ini.</p>
                )}
              </>
            ) : (
              <p className="text-slate-500">Pilih jadwal terlebih dahulu.</p>
            )}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Nilai Harian</h2>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={scoreForm.studentId}
                  onChange={(event) => setScoreForm((prev) => ({ ...prev, studentId: event.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Pilih siswa</option>
                  {attendanceData?.students.map((student) => (
                    <option key={student.studentId} value={student.studentId}>{student.name}</option>
                  ))}
                </select>

                <input
                  type="date"
                  value={scoreForm.date}
                  onChange={(event) => setScoreForm((prev) => ({ ...prev, date: event.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreForm.score}
                  onChange={(event) => setScoreForm((prev) => ({ ...prev, score: event.target.value }))}
                  placeholder="Nilai 0-100"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />

                <label className="text-sm text-slate-600">
                  Keaktifan (1–5)
                  <select
                    value={scoreForm.activityScore}
                    onChange={(event) => setScoreForm((prev) => ({ ...prev, activityScore: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Pilih nilai keaktifan</option>
                    <option value="1">1 — Hampir tidak pernah menjawab</option>
                    <option value="2">2 — Jarang menjawab</option>
                    <option value="3">3 — Kadang-kadang menjawab</option>
                    <option value="4">4 — Sering menjawab</option>
                    <option value="5">5 — Sangat sering menjawab</option>
                  </select>
                </label>

                <input
                  type="text"
                  value={scoreForm.note}
                  onChange={(event) => setScoreForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Catatan"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <button
                type="button"
                onClick={handleScoreSave}
                disabled={savingScore}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {savingScore ? 'Menyimpan...' : 'Simpan Nilai'}
              </button>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Siswa</th>
                    <th className="px-3 py-2">Mapel</th>
                    <th className="px-3 py-2">Nilai</th>
                    <th className="px-3 py-2">Keaktifan</th>
                    <th className="px-3 py-2">Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyScores.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-slate-500">Belum ada nilai yang tersimpan.</td>
                    </tr>
                  ) : (
                    dailyScores.slice(0, 6).map((score) => (
                      <tr key={score.id} className="border-t">
                        <td className="px-3 py-2">{score.studentName}</td>
                        <td className="px-3 py-2">{score.subjectName}</td>
                        <td className="px-3 py-2">{score.score}</td>
                        <td className="px-3 py-2">{score.activityScore ?? '-'}/5</td>
                        <td className="px-3 py-2">{formatDateLabel(score.date)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Permintaan Reset Password</h2>
            {resetRequests.length === 0 ? (
              <p className="mt-4 text-slate-500">Belum ada permintaan yang menunggu.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {resetRequests.map((request) => (
                  <div key={request.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{request.student.name}</p>
                        <p className="text-xs text-slate-500">{request.student.className ?? 'Tanpa kelas'} • NIS: {request.student.nis}</p>
                      </div>
                      <span className="rounded-full bg-yellow-100 px-2 py-1 text-[10px] font-medium uppercase text-yellow-700">
                        {request.status}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleResetRequest(request.id, 'APPROVED')}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetRequest(request.id, 'REJECTED')}
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Tolak
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Feedback</h2>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              rows={6}
              placeholder="Tuliskan saran atau catatan untuk pengembangan LMS..."
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={handleFeedbackSubmit}
              disabled={sendingFeedback}
              className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {sendingFeedback ? 'Mengirim...' : 'Kirim Feedback'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

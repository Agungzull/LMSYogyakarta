'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL, apiRequest, openProtectedResource } from '@/lib/api';
import LogoutButton from '@/components/logout-button';
import TryoutsSection from './tryouts-section';
import ReportsSection from './reports-section';

type ClassItem = { id: string; name: string; studentCount: number; scheduleCount: number };
type SubjectItem = { id: string; name: string; code: string; teacherCount: number };
type StudentItem = { id: string; name: string; username: string; nis: string; className: string | null; isActive: boolean };
type TeacherItem = { id: string; name: string; username: string; email: string | null; nip: string; isActive: boolean; subjects: Array<{ subject: string }> };
type ScheduleItem = { id: string; className: string; subjectName: string; teacherName: string; dayOfWeek: number; startTime: string; endTime: string };
type MaterialItem = { id: string; title: string; type: 'PDF' | 'VIDEO'; fileUrl: string; weekNumber: number; subject: string; className: string; uploadedBy: string; availableFrom: string; availableUntil: string };
type NewAccountCredential = {
  role: 'Siswa' | 'Guru';
  name: string;
  username: string;
  password: string;
  identifier?: string;
  className?: string;
};

function toDateTimeInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function AdminDashboardPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [className, setClassName] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingClassName, setEditingClassName] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingSubject, setEditingSubject] = useState({ name: '', code: '' });
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [editingTeacher, setEditingTeacher] = useState({ name: '', nip: '' });
  const [studentForm, setStudentForm] = useState({ name: '', nis: '', classId: '' });
  const [teacherForm, setTeacherForm] = useState({ name: '', nip: '', subjectIds: [] as string[] });
  const [scheduleForm, setScheduleForm] = useState({ classId: '', subjectId: '', teacherId: '', dayOfWeek: '1', startTime: '08:00', endTime: '09:30' });
  const [materialForm, setMaterialForm] = useState(() => {
    const availableFrom = new Date();
    const availableUntil = new Date();
    availableUntil.setDate(availableUntil.getDate() + 7);
    return {
      title: '', type: 'PDF' as 'PDF' | 'VIDEO', classId: '', subjectId: '', weekNumber: '1',
      availableFrom: toDateTimeInput(availableFrom), availableUntil: toDateTimeInput(availableUntil), videoUrl: ''
    };
  });
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [newAccountCredentials, setNewAccountCredentials] = useState<NewAccountCredential[]>([]);
  const [exportingCredentials, setExportingCredentials] = useState(false);
  const materialFileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  async function refreshData() {
    try {
      const [classesResponse, subjectsResponse, studentsResponse, teachersResponse, schedulesResponse, materialsResponse] = await Promise.all([
        apiRequest<{ success: boolean; data: ClassItem[] }>('/api/admin/classes'),
        apiRequest<{ success: boolean; data: SubjectItem[] }>('/api/admin/subjects'),
        apiRequest<{ success: boolean; data: StudentItem[] }>('/api/admin/students'),
        apiRequest<{ success: boolean; data: TeacherItem[] }>('/api/admin/teachers'),
        apiRequest<{ success: boolean; data: ScheduleItem[] }>('/api/admin/schedules'),
        apiRequest<{ success: boolean; data: MaterialItem[] }>('/api/admin/materials')
      ]);

      setClasses(classesResponse.data ?? []);
      setSubjects(subjectsResponse.data ?? []);
      setStudents(studentsResponse.data ?? []);
      setTeachers(teachersResponse.data ?? []);
      setSchedules(schedulesResponse.data ?? []);
      setMaterials(materialsResponse.data ?? []);

      if (!scheduleForm.classId && classesResponse.data?.[0]) {
        setScheduleForm((current) => ({ ...current, classId: classesResponse.data[0].id }));
      }
      if (!scheduleForm.subjectId && subjectsResponse.data?.[0]) {
        setScheduleForm((current) => ({ ...current, subjectId: subjectsResponse.data[0].id }));
      }
      if (!scheduleForm.teacherId && teachersResponse.data?.[0]) {
        setScheduleForm((current) => ({ ...current, teacherId: teachersResponse.data[0].id }));
      }
      if (!materialForm.classId && classesResponse.data?.[0]) {
        setMaterialForm((current) => ({ ...current, classId: classesResponse.data[0].id }));
      }
      if (!materialForm.subjectId && subjectsResponse.data?.[0]) {
        setMaterialForm((current) => ({ ...current, subjectId: subjectsResponse.data[0].id }));
      }
    } catch (error: any) {
      setMessage(error.message ?? 'Gagal memuat data admin.');
    }
  }

  useEffect(() => {
    refreshData();
  }, []);

  async function handleCreateClass() {
    try {
      await apiRequest('/api/admin/classes', {
        method: 'POST',
        body: JSON.stringify({ name: className })
      });
      setMessage('Kelas berhasil ditambahkan.');
      setClassName('');
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menambahkan kelas.');
    }
  }

  async function handleCreateSubject() {
    try {
      await apiRequest('/api/admin/subjects', {
        method: 'POST',
        body: JSON.stringify({ name: subjectName, code: subjectCode })
      });
      setMessage('Mata pelajaran berhasil ditambahkan.');
      setSubjectName('');
      setSubjectCode('');
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menambahkan mata pelajaran.');
    }
  }

  async function handleUpdateClass(id: string) {
    try {
      await apiRequest(`/api/admin/classes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editingClassName })
      });
      setEditingClassId(null);
      setMessage('Kelas berhasil diperbarui.');
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memperbarui kelas.');
    }
  }

  async function handleUpdateSubject(id: string) {
    try {
      await apiRequest(`/api/admin/subjects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(editingSubject)
      });
      setEditingSubjectId(null);
      setMessage('Mata pelajaran berhasil diperbarui.');
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memperbarui mata pelajaran.');
    }
  }

  async function handleUpdateTeacher(id: string) {
    try {
      await apiRequest(`/api/admin/teachers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingTeacher.name,
          nip: editingTeacher.nip
        })
      });
      setEditingTeacherId(null);
      setMessage('Data guru berhasil diperbarui.');
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memperbarui data guru.');
    }
  }

  async function handleDeleteTeacher(teacher: TeacherItem) {
    if (!window.confirm(`Hapus guru ${teacher.name}? Akun guru dan jadwal mengajarnya akan ikut dihapus.`)) return;

    try {
      await apiRequest(`/api/admin/teachers/${teacher.id}`, { method: 'DELETE' });
      setMessage(`Guru ${teacher.name} berhasil dihapus.`);
      if (editingTeacherId === teacher.id) setEditingTeacherId(null);
      if (scheduleForm.teacherId === teacher.id) {
        const nextTeacher = teachers.find((item) => item.id !== teacher.id);
        setScheduleForm((current) => ({ ...current, teacherId: nextTeacher?.id ?? '' }));
      }
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menghapus guru.');
    }
  }

  async function handleCreateStudent() {
    try {
      const classTarget = classes.find((item) => item.name === studentForm.classId)
        ?? classes.find((item) => item.id === studentForm.classId)
        ?? classes[0];

      const result = await apiRequest<{ data: { username: string; password: string } }>('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify({
          name: studentForm.name,
          nis: studentForm.nis,
          classId: classTarget?.id,
          birthDate: '2009-01-01',
          email: ''
        })
      });

      setNewAccountCredentials((current) => [...current, {
        role: 'Siswa',
        name: studentForm.name,
        username: result.data.username,
        password: result.data.password,
        identifier: studentForm.nis,
        className: classTarget?.name
      }]);
      setMessage('Siswa berhasil ditambahkan. Kredensial akun baru siap diunduh dalam Excel; password wajib diganti saat login pertama.');
      setStudentForm({ name: '', nis: '', classId: '' });
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menambahkan siswa.');
    }
  }

  async function handleCreateTeacher(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await apiRequest<{ data: { username: string; password: string } }>('/api/admin/teachers', {
        method: 'POST',
        body: JSON.stringify({
          name: teacherForm.name,
          nip: teacherForm.nip,
          subjectIds: teacherForm.subjectIds
        })
      });

      setNewAccountCredentials((current) => [...current, {
        role: 'Guru',
        name: teacherForm.name,
        username: result.data.username,
        password: result.data.password,
        identifier: teacherForm.nip
      }]);
      setMessage('Guru berhasil ditambahkan. Kredensial akun baru siap diunduh dalam Excel; password wajib diganti saat login pertama.');
      setTeacherForm({ name: '', nip: '', subjectIds: [] });
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menambahkan guru.');
    }
  }

  async function handleCreateSchedule() {
    try {
      await apiRequest('/api/admin/schedules', {
        method: 'POST',
        body: JSON.stringify({
          classId: scheduleForm.classId,
          subjectId: scheduleForm.subjectId,
          teacherId: scheduleForm.teacherId,
          dayOfWeek: Number(scheduleForm.dayOfWeek),
          startTime: scheduleForm.startTime,
          endTime: scheduleForm.endTime
        })
      });

      setMessage('Jadwal berhasil disimpan.');
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan jadwal.');
    }
  }

  async function handleCreateMaterial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (materialForm.type === 'PDF' && !materialFile) {
      setMessage('Pilih file PDF terlebih dahulu.');
      return;
    }

    setSavingMaterial(true);
    try {
      const token = localStorage.getItem('lms_access_token');
      const body = new FormData();
      body.append('title', materialForm.title);
      body.append('type', materialForm.type);
      body.append('classId', materialForm.classId);
      body.append('subjectId', materialForm.subjectId);
      body.append('weekNumber', materialForm.weekNumber);
      body.append('availableFrom', new Date(materialForm.availableFrom).toISOString());
      body.append('availableUntil', new Date(materialForm.availableUntil).toISOString());
      if (materialForm.type === 'PDF' && materialFile) body.append('file', materialFile);
      if (materialForm.type === 'VIDEO') body.append('fileUrl', materialForm.videoUrl);

      const response = await fetch(`${API_URL}/api/admin/materials`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Materi gagal disimpan');

      setMessage(payload.message ?? 'Materi berhasil dibuat.');
      setMaterialForm((current) => ({ ...current, title: '', videoUrl: '' }));
      setMaterialFile(null);
      if (materialFileInput.current) materialFileInput.current.value = '';
      await refreshData();
    } catch (error: any) {
      setMessage(error.message ?? 'Materi gagal disimpan.');
    } finally {
      setSavingMaterial(false);
    }
  }

  async function handleDeleteMaterial(id: string) {
    try {
      await apiRequest(`/api/admin/materials/${id}`, { method: 'DELETE' });
      setMessage('Materi berhasil dihapus.');
      await refreshData();
    } catch (error: any) {
      setMessage(error.message ?? 'Materi gagal dihapus.');
    }
  }

  async function handleExcelImport(type: 'students' | 'teachers', event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
    const token = localStorage.getItem('lms_access_token');
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/admin/${type}/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token ?? ''}`
      },
      body: formData
    });

    const payload = await response.json() as {
      message?: string;
      data?: {
        createdAccounts?: Array<{
          name: string;
          username: string;
          password: string | null;
          nis?: string;
          nip?: string;
          className?: string;
        }>;
        errors?: Array<{ row: number; message: string }>;
      };
    };
    const newAccountCredentials = payload.data?.createdAccounts?.filter(
      (account): account is typeof account & { password: string } => account.password !== null
    ) ?? [];
    const exportAccounts = newAccountCredentials.map((account) => ({
      role: type === 'students' ? 'Siswa' as const : 'Guru' as const,
      name: account.name,
      username: account.username,
      password: account.password,
      identifier: account.nis ?? account.nip,
      className: account.className
    }));
    if (exportAccounts.length > 0) {
      setNewAccountCredentials((current) => [...current, ...exportAccounts]);
    }
    const credentialsMessage = exportAccounts.length > 0
      ? `Kredensial ${exportAccounts.length} akun baru siap diunduh dalam Excel. Password wajib diganti saat login pertama.`
      : '';

    if (!response.ok) {
      const rowErrors = payload.data?.errors?.map((item) => `Baris ${item.row}: ${item.message}`).join(' ') ?? '';
      setMessage([payload.message ?? 'Import Excel gagal.', rowErrors, credentialsMessage].filter(Boolean).join(' '));
      if (newAccountCredentials.length > 0) await refreshData();
      return;
    }

    setMessage([payload.message ?? 'Import Excel berhasil.', credentialsMessage].filter(Boolean).join(' '));
    refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import Excel gagal.');
    } finally {
      event.target.value = '';
    }
  }

  async function downloadNewAccountCredentials() {
    if (newAccountCredentials.length === 0 || exportingCredentials) return;
    setExportingCredentials(true);
    try {
      const token = localStorage.getItem('lms_access_token');
      if (!token) throw new Error('Sesi login tidak ditemukan. Silakan login kembali.');

      const response = await fetch(`${API_URL}/api/admin/users/credentials/export`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ accounts: newAccountCredentials })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message ?? 'Excel kredensial gagal dibuat.');
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `kredensial-akun-baru-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setNewAccountCredentials([]);
      setMessage('Excel kredensial berhasil diunduh. Simpan file dengan aman; password wajib diganti saat login pertama.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Excel kredensial gagal diunduh.');
    } finally {
      setExportingCredentials(false);
    }
  }

  const selectedStudentClassId = studentForm.classId || classes[0]?.id || '';

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Admin</p>
              <h1 className="mt-3 text-3xl font-black">Dashboard Admin</h1>
              <p className="mt-2 text-sm text-slate-300">Data kelas, mata pelajaran, siswa, guru, dan jadwal sekolah.</p>
            </div>
            <LogoutButton />
          </div>
        </header>

        {message ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
        {newAccountCredentials.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              {newAccountCredentials.length} akun baru memiliki password sementara. File Excel berisi kredensial sensitif; simpan dan bagikan dengan aman.
            </p>
            <button type="button" onClick={() => void downloadNewAccountCredentials()} disabled={exportingCredentials} className="disabled:opacity-50">
              {exportingCredentials ? 'Menyiapkan Excel...' : 'Unduh kredensial akun baru (.xlsx)'}
            </button>
          </div>
        ) : null}

        <section className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-slate-500">Kelas</p><p className="mt-2 text-3xl font-bold text-slate-900">{classes.length}</p></div>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-slate-500">Mata Pelajaran</p><p className="mt-2 text-3xl font-bold text-slate-900">{subjects.length}</p></div>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-slate-500">Jadwal</p><p className="mt-2 text-3xl font-bold text-slate-900">{schedules.length}</p></div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-bold text-slate-900">Kelas</h2>
            <form onSubmit={(event) => { event.preventDefault(); void handleCreateClass(); }} className="mt-4 flex gap-3">
              <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Contoh: 9A" className="flex-1" minLength={2} required />
              <button type="submit" className="whitespace-nowrap">Tambah</button>
            </form>
            <ul className="mt-4 space-y-2">
              {classes.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {editingClassId === item.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); void handleUpdateClass(item.id); }} className="flex w-full flex-wrap items-center gap-2">
                      <input aria-label="Nama kelas" value={editingClassName} onChange={(event) => setEditingClassName(event.target.value)} minLength={2} maxLength={30} required className="min-w-32 flex-1" />
                      <span>{item.studentCount} siswa</span>
                      <button type="submit">Simpan</button>
                      <button type="button" onClick={() => setEditingClassId(null)} className="bg-slate-200 text-slate-700">Batal</button>
                    </form>
                  ) : (
                    <>
                      <span>{item.name}</span>
                      <span className="flex items-center gap-2">
                        {item.studentCount} siswa
                        <button type="button" onClick={() => { setEditingClassId(item.id); setEditingClassName(item.name); }} className="bg-slate-200 text-slate-700">Edit</button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-bold text-slate-900">Mata Pelajaran</h2>
            <div className="mt-4 space-y-3">
              <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Nama mata pelajaran" className="w-full" />
              <input value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} placeholder="Kode (contoh: MAT)" className="w-full" />
              <button onClick={handleCreateSubject} className="w-full">Tambah Mata Pelajaran</button>
            </div>
            <ul className="mt-4 space-y-2">
              {subjects.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {editingSubjectId === item.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); void handleUpdateSubject(item.id); }} className="flex w-full flex-wrap items-center gap-2">
                      <input aria-label="Nama mata pelajaran" value={editingSubject.name} onChange={(event) => setEditingSubject({ ...editingSubject, name: event.target.value })} minLength={2} required className="min-w-32 flex-1" />
                      <input aria-label="Kode mata pelajaran" value={editingSubject.code} onChange={(event) => setEditingSubject({ ...editingSubject, code: event.target.value })} minLength={2} required className="w-24" />
                      <span>{item.teacherCount} guru</span>
                      <button type="submit">Simpan</button>
                      <button type="button" onClick={() => setEditingSubjectId(null)} className="bg-slate-200 text-slate-700">Batal</button>
                    </form>
                  ) : (
                    <>
                      <span>{item.name} ({item.code})</span>
                      <span className="flex items-center gap-2">
                        {item.teacherCount} guru
                        <button type="button" onClick={() => { setEditingSubjectId(item.id); setEditingSubject({ name: item.name, code: item.code }); }} className="bg-slate-200 text-slate-700">Edit</button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-bold text-slate-900">Siswa</h2>
            <div className="mt-4 space-y-3">
              <input value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} placeholder="Nama lengkap" className="w-full" minLength={2} required />
              <input value={studentForm.nis} onChange={(e) => setStudentForm({ ...studentForm, nis: e.target.value })} placeholder="NIS" className="w-full" minLength={3} required />
              <select value={selectedStudentClassId} onChange={(e) => setStudentForm({ ...studentForm, classId: e.target.value })} className="w-full" required disabled={classes.length === 0}>
                {classes.length === 0 ? <option value="">Tambahkan kelas terlebih dahulu</option> : null}
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <button onClick={() => void handleCreateStudent()} className="w-full" disabled={classes.length === 0}>Tambah Siswa</button>
            </div>

            <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Import Excel siswa</label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleExcelImport('students', event)} className="w-full" />
            </div>

            <div className="mt-4 max-h-64 space-y-2 overflow-auto">
              {students.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.nis} • {item.className ?? '-'}</p>
                  </div>
                  <span className="text-xs text-slate-500">{item.username}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-bold text-slate-900">Guru</h2>
            <form onSubmit={(event) => void handleCreateTeacher(event)} className="mt-4 space-y-3">
              <input value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} placeholder="Nama guru" className="w-full" minLength={2} required />
              <input value={teacherForm.nip} onChange={(e) => setTeacherForm({ ...teacherForm, nip: e.target.value })} placeholder="NIP" className="w-full" minLength={3} required />
              <label className="block text-sm text-slate-600">
                Mata pelajaran
                <select
                  multiple
                  value={teacherForm.subjectIds}
                  onChange={(event) => setTeacherForm({
                    ...teacherForm,
                    subjectIds: Array.from(event.currentTarget.selectedOptions, (option) => option.value)
                  })}
                  className="mt-1 min-h-24 w-full"
                >
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
                <span className="mt-1 block text-xs text-slate-500">Tahan Ctrl untuk memilih lebih dari satu.</span>
              </label>
              <button type="submit" className="w-full">Tambah Guru</button>
            </form>

            <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Import Excel guru</label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleExcelImport('teachers', event)} className="w-full" />
            </div>

            <div className="mt-4 max-h-64 space-y-2 overflow-auto">
              {teachers.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                  {editingTeacherId === item.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); void handleUpdateTeacher(item.id); }} className="grid w-full min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <input aria-label="Nama guru" placeholder="Nama guru" value={editingTeacher.name} onChange={(event) => setEditingTeacher({ ...editingTeacher, name: event.target.value })} minLength={2} required />
                      <input aria-label="NIP guru" placeholder="NIP" value={editingTeacher.nip} onChange={(event) => setEditingTeacher({ ...editingTeacher, nip: event.target.value })} minLength={3} required />
                      <div className="flex gap-2">
                        <button type="submit">Simpan</button>
                        <button type="button" onClick={() => setEditingTeacherId(null)} className="bg-slate-200 text-slate-700">Batal</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-xs text-slate-500">NIP: {item.nip}</p>
                        <p className="text-xs text-slate-500">Username: {item.username}</p>
                        <p className="text-xs text-slate-500">{item.subjects.map((subject) => subject.subject).join(', ') || 'Belum ada mata pelajaran'}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => { setEditingTeacherId(item.id); setEditingTeacher({ name: item.name, nip: item.nip }); }} className="bg-slate-200 text-slate-700">Edit</button>
                        <button type="button" onClick={() => void handleDeleteTeacher(item)} className="bg-rose-600 text-white hover:bg-rose-700">Hapus</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Jadwal</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <select value={scheduleForm.classId} onChange={(e) => setScheduleForm({ ...scheduleForm, classId: e.target.value })} className="w-full">
              {classes.map((item) => (<option key={item.id} value={item.id}>{item.name}</option>))}
            </select>
            <select value={scheduleForm.subjectId} onChange={(e) => setScheduleForm({ ...scheduleForm, subjectId: e.target.value })} className="w-full">
              {subjects.map((item) => (<option key={item.id} value={item.id}>{item.name}</option>))}
            </select>
            <select value={scheduleForm.teacherId} onChange={(e) => setScheduleForm({ ...scheduleForm, teacherId: e.target.value })} className="w-full">
              {teachers.map((item) => (<option key={item.id} value={item.id}>{item.name}</option>))}
            </select>
            <select value={scheduleForm.dayOfWeek} onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: e.target.value })} className="w-full">
              <option value="1">Senin</option>
              <option value="2">Selasa</option>
              <option value="3">Rabu</option>
              <option value="4">Kamis</option>
              <option value="5">Jumat</option>
            </select>
            <input type="time" value={scheduleForm.startTime} onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} className="w-full" />
            <input type="time" value={scheduleForm.endTime} onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })} className="w-full" />
          </div>
          <button onClick={handleCreateSchedule} className="mt-4 w-full md:w-auto">Simpan Jadwal</button>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="px-3 py-2">Kelas</th>
                  <th className="px-3 py-2">Mata Pelajaran</th>
                  <th className="px-3 py-2">Guru</th>
                  <th className="px-3 py-2">Hari</th>
                  <th className="px-3 py-2">Jam</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200">
                    <td className="px-3 py-2">{item.className}</td>
                    <td className="px-3 py-2">{item.subjectName}</td>
                    <td className="px-3 py-2">{item.teacherName}</td>
                    <td className="px-3 py-2">{['Senin','Selasa','Rabu','Kamis','Jumat'][item.dayOfWeek - 1]}</td>
                    <td className="px-3 py-2">{item.startTime} - {item.endTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Materi Mingguan</h2>
          <form onSubmit={handleCreateMaterial} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input value={materialForm.title} onChange={(event) => setMaterialForm({ ...materialForm, title: event.target.value })} placeholder="Judul materi" className="w-full" required />
            <select value={materialForm.type} onChange={(event) => { setMaterialForm({ ...materialForm, type: event.target.value as 'PDF' | 'VIDEO' }); setMaterialFile(null); }} className="w-full">
              <option value="PDF">PDF</option>
              <option value="VIDEO">Video</option>
            </select>
            <select value={materialForm.classId} onChange={(event) => setMaterialForm({ ...materialForm, classId: event.target.value })} className="w-full" required>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={materialForm.subjectId} onChange={(event) => setMaterialForm({ ...materialForm, subjectId: event.target.value })} className="w-full" required>
              {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {materialForm.type === 'PDF' ? (
              <input ref={materialFileInput} type="file" accept="application/pdf,.pdf" aria-label="File PDF materi" onChange={(event) => setMaterialFile(event.target.files?.[0] ?? null)} className="w-full" required />
            ) : (
              <input type="url" value={materialForm.videoUrl} onChange={(event) => setMaterialForm({ ...materialForm, videoUrl: event.target.value })} placeholder="URL video" className="w-full" required />
            )}
            <label className="text-sm text-slate-600">Minggu ke<input type="number" min="1" max="52" value={materialForm.weekNumber} onChange={(event) => setMaterialForm({ ...materialForm, weekNumber: event.target.value })} className="mt-1 w-full" required /></label>
            <label className="text-sm text-slate-600">Mulai tersedia<input type="datetime-local" value={materialForm.availableFrom} onChange={(event) => setMaterialForm({ ...materialForm, availableFrom: event.target.value })} className="mt-1 w-full" required /></label>
            <label className="text-sm text-slate-600">Akhir tersedia<input type="datetime-local" value={materialForm.availableUntil} onChange={(event) => setMaterialForm({ ...materialForm, availableUntil: event.target.value })} className="mt-1 w-full" required /></label>
            <button type="submit" disabled={savingMaterial} className="self-end whitespace-nowrap">{savingMaterial ? 'Menyimpan...' : 'Tambah Materi'}</button>
          </form>

          <div className="mt-5 divide-y divide-slate-200">
            {materials.length === 0 ? <p className="py-3 text-sm text-slate-500">Belum ada materi mingguan.</p> : materials.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-slate-800">Minggu {item.weekNumber}: {item.title}</p>
                  <p className="text-sm text-slate-500">{item.type} · {item.subject} · {item.className} · {new Date(item.availableFrom).toLocaleDateString('id-ID')}–{new Date(item.availableUntil).toLocaleDateString('id-ID')}</p>
                </div>
                <div className="flex items-center gap-2">
                  {item.type === 'PDF' ? <>
                    <button type="button" onClick={() => void openProtectedResource(`/api/content/materials/${item.id}/file`).catch((error: Error) => setMessage(error.message))} className="bg-slate-700 hover:bg-slate-800">Lihat</button>
                    <button type="button" onClick={() => void openProtectedResource(`/api/content/materials/${item.id}/file`, true).catch((error: Error) => setMessage(error.message))}>Unduh</button>
                  </> : <a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-700">Buka video</a>}
                  <button type="button" onClick={() => void handleDeleteMaterial(item.id)} className="bg-rose-600 hover:bg-rose-700">Hapus</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <TryoutsSection classes={classes} />
        <ReportsSection />
      </div>
    </main>
  );
}

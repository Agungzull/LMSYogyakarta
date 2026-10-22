import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { socketState } from '../lib/socket-state.js';
import { removeMaterialFile, saveMaterialFile } from '../lib/material-file-storage.js';
import { removeExplanationImage, saveExplanationImage, removeQuestionImage, saveQuestionImage } from '../lib/tryout-explanation-storage.js';

const VALID_CLASS_NAMES = ['9A', '9B', '9C', '9D', '9E', '9F', '9G'];
const CONFUSING_CHARS = '0oO1liI';

function generateTemporaryPassword() {
  const random = crypto.randomBytes(6).toString('hex');
  return `${random}Ab1!`;
}

function generateSafePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pool = `${letters}${digits}`;
  let password = '';

  for (let index = 0; index < 8; index += 1) {
    password += pool[crypto.randomInt(pool.length)];
  }

  return password;
}

function normalizeUsernamePart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function generateUniqueUsername(name: string, identifier: string, excludeUserId?: string) {
  const usernameBase = `${normalizeUsernamePart(name)}${normalizeUsernamePart(identifier)}` || 'user';

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const candidate = attempt === 1 ? usernameBase : `${usernameBase}${attempt}`;
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true }
    });
    if (!existing || existing.id === excludeUserId) return candidate;
  }

  throw new Error('Username otomatis gagal dibuat karena terjadi konflik. Periksa nama dan identitas lalu coba lagi.');
}

function normalizeString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toMinutes(time: string) {
  const [hour, minute] = (time ?? '00:00').split(':').map(Number);
  return hour * 60 + minute;
}

function safeText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function createClassNameFromValue(value: string | undefined) {
  if (!value) return '';
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

const studentSchema = z.object({
  name: z.string().min(2),
  username: z.string().min(3).optional(),
  email: z.string().email().optional().or(z.literal('')),
  nis: z.string().min(3),
  classId: z.string().min(1).optional(),
  birthDate: z.string().optional(),
  password: z.string().min(8).optional()
});

const teacherSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().min(3).optional(),
  email: z.string().email().optional().or(z.literal('')),
  nip: z.string().min(3),
  subjectIds: z.array(z.string()).optional().default([]),
  password: z.string().min(8).optional()
});

const materialSchema = z.object({
  title: z.string().min(2),
  type: z.enum(['PDF', 'VIDEO']),
  fileUrl: z.string().url().optional(),
  subjectId: z.string().min(1),
  classId: z.string().min(1),
  weekNumber: z.coerce.number().int().min(1).max(52),
  availableFrom: z.string().datetime(),
  availableUntil: z.string().datetime()
});

const resetDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'])
});

const credentialExportSchema = z.object({
  accounts: z.array(z.object({
    role: z.enum(['Siswa', 'Guru']),
    name: z.string().trim().min(1).max(150),
    username: z.string().trim().min(1).max(100),
    password: z.string().min(1).max(256),
    identifier: z.string().trim().max(100).optional(),
    className: z.string().trim().max(100).optional()
  })).min(1).max(5000)
});

const tryoutSchema = z.object({
  title: z.string().min(2),
  durationMinutes: z.number().int().positive(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  classId: z.string().min(1),
  shuffleQuestions: z.boolean().optional().default(false),
  certificateEnabled: z.boolean().optional().default(true),
  certificateMinimumScore: z.number().min(0).max(100).optional().default(0),
  certificateSignerName: z.string().trim().max(120).optional().default(''),
  certificateSignerTitle: z.string().trim().max(120).optional().default(''),
  questions: z.array(
    z.object({
      type: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE']).default('SINGLE_CHOICE'),
      text: z.string().min(2),
      imageUrl: z.string().optional().nullable(),
      options: z.array(z.string().min(1)).min(2),
      correctAnswer: z.string().min(1),
      questionImageIndex: z.number().int().min(0).optional(),
      explanationImageIndex: z.number().int().min(0).optional(),
      existingImageUrl: z.string().optional().nullable(),
      existingExplanationImageUrl: z.string().optional().nullable(),
      points: z.number().int().positive().default(1),
      explanation: z.string().optional().nullable()
    }).superRefine((question, context) => {
      if (question.type === 'SINGLE_CHOICE') {
        if (!question.options.includes(question.correctAnswer)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['correctAnswer'],
            message: 'Jawaban benar harus sesuai salah satu pilihan'
          });
        }
        return;
      }

      let correctAnswers: unknown;
      try {
        correctAnswers = JSON.parse(question.correctAnswer);
      } catch {
        correctAnswers = null;
      }
      if (
        !Array.isArray(correctAnswers) ||
        correctAnswers.length < 2 ||
        correctAnswers.some((answer) => typeof answer !== 'string' || !question.options.includes(answer)) ||
        new Set(correctAnswers).size !== correctAnswers.length
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctAnswer'],
          message: 'Pilih minimal dua jawaban benar yang berbeda dan sesuai dengan pilihan'
        });
      }
    })
  ).min(1)
}).refine((tryout) => new Date(tryout.endAt) > new Date(tryout.startAt), {
  path: ['endAt'],
  message: 'Waktu selesai harus setelah waktu mulai'
});

const classSchema = z.object({
  name: z.string().trim().min(2).max(30)
});

const subjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(20)
});

const scheduleSchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
  dayOfWeek: z.number().int().min(1).max(5),
  startTime: z.string().min(4),
  endTime: z.string().min(4)
});

async function parseExcelRows(file: Express.Multer.File) {
  const workbook = new ExcelJS.Workbook();
  const workbookBuffer = new Uint8Array(file.buffer);
  await workbook.xlsx.load(workbookBuffer as any);
  const worksheet = workbook.worksheets[0];
  const rows: Record<string, string>[] = [];

  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const values = row.values as Array<string | number | Date | null>;
    const item: Record<string, string> = {};

    for (let index = 1; index <= 10; index += 1) {
      item[`col${index}`] = safeText(values[index]);
    }

    rows.push(item);
  });

  return rows;
}

export async function getClasses(req: Request, res: Response) {
  const classes = await prisma.class.findMany({
    include: { students: true, schedules: true },
    orderBy: { name: 'asc' }
  });

  return res.json({
    success: true,
    data: classes.map((item) => ({
      id: item.id,
      name: item.name,
      studentCount: item.students.length,
      scheduleCount: item.schedules.length
    }))
  });
}

export async function createClass(req: Request, res: Response) {
  const parsed = classSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Nama kelas tidak valid' });
  }

  const normalized = createClassNameFromValue(parsed.data.name);
  const existing = await prisma.class.findFirst({ where: { name: normalized } });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Kelas sudah tersedia' });
  }

  const created = await prisma.class.create({
    data: { name: normalized }
  });

  return res.status(201).json({ success: true, message: 'Kelas berhasil dibuat', data: created });
}

export async function updateClass(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  const parsed = classSchema.safeParse(req.body);
  if (!id || !parsed.success) {
    return res.status(400).json({ success: false, message: 'Nama kelas tidak valid' });
  }

  const normalized = createClassNameFromValue(parsed.data.name);
  const existing = await prisma.class.findFirst({ where: { name: normalized, id: { not: id } } });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Nama kelas sudah digunakan' });
  }

  const classroom = await prisma.class.findUnique({ where: { id }, select: { id: true } });
  if (!classroom) {
    return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
  }

  const updated = await prisma.class.update({ where: { id }, data: { name: normalized } });
  return res.json({ success: true, message: 'Kelas berhasil diperbarui', data: updated });
}

export async function getSubjects(req: Request, res: Response) {
  const subjects = await prisma.subject.findMany({
    include: { teacherSubjects: true },
    orderBy: { name: 'asc' }
  });

  return res.json({
    success: true,
    data: subjects.map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
      teacherCount: item.teacherSubjects.length
    }))
  });
}

export async function createSubject(req: Request, res: Response) {
  const parsed = subjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Data mata pelajaran tidak valid' });
  }

  const code = parsed.data.code.trim().toUpperCase();
  const existing = await prisma.subject.findFirst({ where: { OR: [{ code }, { name: parsed.data.name }] } });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Mata pelajaran atau kode sudah ada' });
  }

  const created = await prisma.subject.create({
    data: {
      name: parsed.data.name.trim(),
      code
    }
  });

  return res.status(201).json({ success: true, message: 'Mata pelajaran berhasil dibuat', data: created });
}

export async function updateSubject(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  const parsed = subjectSchema.safeParse(req.body);
  if (!id || !parsed.success) {
    return res.status(400).json({ success: false, message: 'Data mata pelajaran tidak valid' });
  }

  const name = parsed.data.name.trim();
  const code = parsed.data.code.trim().toUpperCase();
  const existing = await prisma.subject.findFirst({
    where: { id: { not: id }, OR: [{ code }, { name }] }
  });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Nama atau kode mata pelajaran sudah digunakan' });
  }

  const subject = await prisma.subject.findUnique({ where: { id }, select: { id: true } });
  if (!subject) {
    return res.status(404).json({ success: false, message: 'Mata pelajaran tidak ditemukan' });
  }

  const updated = await prisma.subject.update({ where: { id }, data: { name, code } });
  return res.json({ success: true, message: 'Mata pelajaran berhasil diperbarui', data: updated });
}

export async function getSchedules(req: Request, res: Response) {
  const schedules = await prisma.schedule.findMany({
    include: {
      class: true,
      subject: true,
      teacher: { include: { user: true } }
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
  });

  return res.json({
    success: true,
    data: schedules.map((item) => ({
      id: item.id,
      className: item.class.name,
      subjectName: item.subject.name,
      teacherName: item.teacher.user.name,
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      endTime: item.endTime
    }))
  });
}

export async function createSchedule(req: Request, res: Response) {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Data jadwal tidak valid' });
  }

  const { classId, subjectId, teacherId, dayOfWeek, startTime, endTime } = parsed.data;
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);

  if (startMinutes >= endMinutes) {
    return res.status(400).json({ success: false, message: 'Jam mulai harus lebih awal dari jam selesai' });
  }

  const scheduleConflict = await prisma.schedule.findFirst({
    where: {
      teacherId,
      dayOfWeek,
      OR: [
        { startTime: { lte: startTime }, endTime: { gt: startTime } },
        { startTime: { lt: endTime }, endTime: { gte: endTime } },
        { startTime: { gte: startTime }, endTime: { lte: endTime } }
      ]
    }
  });

  if (scheduleConflict) {
    return res.status(409).json({
      success: false,
      message: 'Guru sudah mengajar di jam yang sama pada hari tersebut. Silakan pilih slot lain.'
    });
  }

  const existingClassSlot = await prisma.schedule.findFirst({
    where: {
      classId,
      dayOfWeek,
      OR: [
        { startTime: { lte: startTime }, endTime: { gt: startTime } },
        { startTime: { lt: endTime }, endTime: { gte: endTime } },
        { startTime: { gte: startTime }, endTime: { lte: endTime } }
      ]
    }
  });

  if (existingClassSlot) {
    return res.status(409).json({
      success: false,
      message: 'Kelas sudah memiliki jadwal lain di slot waktu tersebut.'
    });
  }

  const created = await prisma.schedule.create({
    data: {
      classId,
      subjectId,
      teacherId,
      dayOfWeek,
      startTime,
      endTime
    },
    include: {
      class: true,
      subject: true,
      teacher: { include: { user: true } }
    }
  });

  return res.status(201).json({
    success: true,
    message: 'Jadwal berhasil dibuat',
    data: {
      id: created.id,
      className: created.class.name,
      subjectName: created.subject.name,
      teacherName: created.teacher.user.name
    }
  });
}

export async function importStudents(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'File Excel siswa wajib diupload' });
  }

  const rows = await parseExcelRows(req.file);
  const errors: Array<{ row: number; message: string }> = [];
  const accountResults: Array<{ name: string; username: string; password: string | null; nis: string; className: string }> = [];

  for (const [index, row] of rows.entries()) {
    const nis = safeText(row.col1 || row.col2).toUpperCase();
    const name = safeText(row.col2 || row.col1);
    const className = safeText(row.col3 || row.col4);
    const schoolOrigin = safeText(row.col4 || row.col5);
    const phone = safeText(row.col5 || row.col6);
    const gender = safeText(row.col6 || row.col7);

    if (!name || !nis || !className) {
      errors.push({ row: index + 2, message: 'NIS, nama, dan kelas wajib diisi.' });
      continue;
    }

    if (!VALID_CLASS_NAMES.includes(className.toUpperCase())) {
      errors.push({ row: index + 2, message: `Kelas tidak dikenal: ${className}` });
      continue;
    }

    const classRecord = await prisma.class.findFirst({ where: { name: className.toUpperCase() } });
    if (!classRecord) {
      errors.push({ row: index + 2, message: `Kelas ${className} tidak tersedia.` });
      continue;
    }

    const existingStudent = await prisma.student.findUnique({
      where: { nis },
      include: { user: true }
    });
    const generatedUsername = await generateUniqueUsername(name, classRecord.name, existingStudent?.userId);
    let generatedPassword: string | null = null;
    let user;
    if (existingStudent) {
      user = await prisma.user.update({
        where: { id: existingStudent.userId },
        data: {
          name,
          username: generatedUsername,
          email: null,
          phone: phone || null,
          isActive: true
        }
      });
    } else {
      const password = generateSafePassword();
      generatedPassword = password;
      user = await prisma.user.create({
        data: {
          name,
          username: generatedUsername,
          email: null,
          passwordHash: await hashPassword(password),
          phone: phone || null,
          role: 'SISWA',
          mustChangePassword: true,
          isActive: true
        }
      });
    }

    let student;
    if (existingStudent) {
      student = await prisma.student.update({
        where: { id: existingStudent.id },
        data: {
          nis,
          classId: classRecord.id,
          schoolOrigin: schoolOrigin || null,
          gender: gender || null
        }
      });
    } else {
      student = await prisma.student.create({
        data: {
          userId: user.id,
          nis,
          classId: classRecord.id,
          schoolOrigin: schoolOrigin || null,
          gender: gender || null
        }
      });
    }

    accountResults.push({
      name,
      username: generatedUsername,
      password: generatedPassword,
      nis: student.nis,
      className: classRecord.name
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Beberapa baris gagal divalidasi.',
      data: { errors, createdAccounts: accountResults }
    });
  }

  return res.status(201).json({
    success: true,
    message: `Import siswa berhasil: ${accountResults.length} akun dibuat atau diperbarui.`,
    data: { createdAccounts: accountResults }
  });
}

export async function importTeachers(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'File Excel guru wajib diupload' });
  }

  const rows = await parseExcelRows(req.file);
  const errors: Array<{ row: number; message: string }> = [];
  const accountResults: Array<{ name: string; username: string; password: string | null; nip: string }> = [];

  for (const [index, row] of rows.entries()) {
    const name = safeText(row.col1 || row.col2);
    const nip = safeText(row.col2 || row.col1);
    const email = safeText(row.col3 || row.col4);
    const phone = safeText(row.col4 || row.col5);
    const subjectsRaw = safeText(row.col5 || row.col6);

    if (!name || !nip || !email) {
      errors.push({ row: index + 2, message: 'Nama, NIP, dan email wajib diisi.' });
      continue;
    }

    const existingTeacher = await prisma.teacher.findUnique({
      where: { nip },
      include: { user: true }
    });
    const username = await generateUniqueUsername(name, nip, existingTeacher?.userId);
    let password: string | null = null;
    let user;
    if (existingTeacher) {
      user = await prisma.user.update({
        where: { id: existingTeacher.userId },
        data: { name, username, email, phone: phone || null, isActive: true }
      });
    } else {
      const temporaryPassword = generateSafePassword();
      password = temporaryPassword;
      user = await prisma.user.create({
        data: {
          name,
          username,
          email,
          passwordHash: await hashPassword(temporaryPassword),
          phone: phone || null,
          role: 'GURU',
          mustChangePassword: true,
          isActive: true
        }
      });
    }

    const teacher = existingTeacher
      ? await prisma.teacher.update({ where: { id: existingTeacher.id }, data: { nip } })
      : await prisma.teacher.create({ data: { userId: user.id, nip } });

    if (subjectsRaw) {
      const subjectNames = subjectsRaw.split(',').map((item) => item.trim()).filter(Boolean);
      for (const subjectName of subjectNames) {
        const code = subjectName.toUpperCase().slice(0, 6) || 'SUBJ';
        const subject = await prisma.subject.upsert({
          where: { code },
          update: { name: subjectName },
          create: { name: subjectName, code }
        });

        const existingTeacherSubject = await prisma.teacherSubject.findFirst({
          where: {
            teacherId: teacher.id,
            subjectId: subject.id,
            classId: null
          }
        });

        if (!existingTeacherSubject) {
          await prisma.teacherSubject.create({
            data: {
              teacherId: teacher.id,
              subjectId: subject.id,
              classId: null
            }
          });
        }
      }
    }

    accountResults.push({ name, username, password, nip });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Beberapa data guru gagal divalidasi.',
      data: { errors, createdAccounts: accountResults }
    });
  }

  return res.status(201).json({
    success: true,
    message: `Import guru berhasil: ${accountResults.length} akun dibuat atau diperbarui.`,
    data: { createdAccounts: accountResults }
  });
}

export async function getStudents(req: Request, res: Response) {
  const classId = normalizeString(req.query.classId as string | string[] | undefined);

  const students = await prisma.student.findMany({
    where: classId ? { classId } : undefined,
    include: {
      user: true,
      class: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.json({
    success: true,
    data: students.map((student) => ({
      id: student.id,
      name: student.user.name,
      username: student.user.username,
      email: student.user.email,
      nis: student.nis,
      className: student.class?.name ?? null,
      birthDate: student.birthDate,
      isActive: student.user.isActive,
      createdAt: student.createdAt
    }))
  });
}

export async function getStudentReports(req: Request, res: Response) {
  const currentDate = new Date();
  const parsed = z.object({
    month: z.coerce.number().int().min(1).max(12).default(currentDate.getMonth() + 1),
    year: z.coerce.number().int().min(2000).max(2100).default(currentDate.getFullYear())
  }).safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Bulan atau tahun raport tidak valid' });
  }

  const { month, year } = parsed.data;
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));
  const students = await prisma.student.findMany({
    include: {
      user: true,
      class: true,
      dailyScores: {
        where: { date: { gte: periodStart, lt: periodEnd } },
        include: { subject: true },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
      },
      attendances: {
        where: { date: { gte: periodStart, lt: periodEnd } },
        orderBy: { date: 'desc' }
      }
    },
    orderBy: [{ class: { name: 'asc' } }, { user: { name: 'asc' } }]
  });

  return res.json({
    success: true,
    data: students.map((student) => {
      const attendanceCount = student.attendances.length;
      const presentCount = student.attendances.filter((item) => item.status === 'HADIR').length;
      const scores = student.dailyScores;
      const activityScores = scores.flatMap((item) => item.activityScore === null ? [] : [item.activityScore]);

      return {
        studentId: student.id,
        name: student.user.name,
        nis: student.nis,
        className: student.class?.name ?? 'Belum ada kelas',
        attendance: {
          total: attendanceCount,
          present: presentCount,
          permission: student.attendances.filter((item) => item.status === 'IZIN').length,
          sick: student.attendances.filter((item) => item.status === 'SAKIT').length,
          absent: student.attendances.filter((item) => item.status === 'ALPA').length,
          percent: attendanceCount ? Math.round((presentCount / attendanceCount) * 100) : null
        },
        averageScore: scores.length
          ? Math.round((scores.reduce((total, item) => total + item.score, 0) / scores.length) * 10) / 10
          : null,
        scoreCount: scores.length,
        averageActivity: activityScores.length
          ? Math.round((activityScores.reduce((total, value) => total + value, 0) / activityScores.length) * 10) / 10
          : null,
        activityCount: activityScores.length,
        dailyScores: scores.map((item) => ({
          date: item.date,
          subject: item.subject.name,
          score: item.score,
          activityScore: item.activityScore,
          note: item.note
        })),
        attendanceRecords: student.attendances.map((item) => ({
          date: item.date,
          status: item.status,
          note: item.note
        }))
      };
    })
  });
}

export async function exportClassReport(req: Request, res: Response) {
  const currentDate = new Date();
  const parsed = z.object({
    classId: z.string().min(1),
    type: z.enum(['scores', 'attendance', 'both']),
    month: z.coerce.number().int().min(1).max(12).default(currentDate.getMonth() + 1),
    year: z.coerce.number().int().min(2000).max(2100).default(currentDate.getFullYear())
  }).safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Parameter ekspor raport kelas tidak valid' });
  }

  const { classId, type, month, year } = parsed.data;
  const classData = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      students: {
        include: {
          user: true,
          dailyScores: {
            where: { date: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } },
            include: { subject: true },
            orderBy: [{ date: 'asc' }, { subject: { name: 'asc' } }]
          },
          attendances: {
            where: { date: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } },
            include: { schedule: { include: { subject: true } } },
            orderBy: [{ date: 'asc' }, { schedule: { subject: { name: 'asc' } } }]
          }
        },
        orderBy: { user: { name: 'asc' } }
      }
    }
  });

  if (!classData) {
    return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Learning Management System Cakrawala';
  workbook.created = new Date();

  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1D4ED8' } },
    alignment: { vertical: 'middle' as const }
  };
  const periodLabel = `${String(month).padStart(2, '0')}/${year}`;

  if (type === 'scores' || type === 'both') {
    const sheet = workbook.addWorksheet('Nilai');
    sheet.columns = [
      { header: 'Nama Siswa', key: 'name', width: 30 },
      { header: 'NIS', key: 'nis', width: 18 },
      { header: 'Mata Pelajaran', key: 'subject', width: 26 },
      { header: 'Tanggal', key: 'date', width: 16 },
      { header: 'Nilai', key: 'score', width: 12 },
      { header: 'Keaktifan / 5', key: 'activityScore', width: 16 },
      { header: 'Catatan', key: 'note', width: 40 }
    ];
    for (const student of classData.students) {
      for (const score of student.dailyScores) {
        sheet.addRow({
          name: student.user.name,
          nis: student.nis,
          subject: score.subject.name,
          date: score.date,
          score: score.score,
          activityScore: score.activityScore,
          note: score.note ?? ''
        });
      }
    }
    sheet.insertRow(1, [`Rekap Nilai Kelas ${classData.name} · ${periodLabel}`]);
    sheet.mergeCells(1, 1, 1, 7);
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.getRow(2).eachCell((cell) => { cell.style = headerStyle; });
    sheet.getColumn(4).numFmt = 'dd mmm yyyy';
    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    sheet.autoFilter = { from: 'A2', to: `G${Math.max(2, sheet.rowCount)}` };
  }

  if (type === 'attendance' || type === 'both') {
    const sheet = workbook.addWorksheet('Absensi');
    sheet.columns = [
      { header: 'Nama Siswa', key: 'name', width: 30 },
      { header: 'NIS', key: 'nis', width: 18 },
      { header: 'Mata Pelajaran', key: 'subject', width: 26 },
      { header: 'Tanggal', key: 'date', width: 16 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Catatan', key: 'note', width: 40 }
    ];
    for (const student of classData.students) {
      for (const attendance of student.attendances) {
        sheet.addRow({
          name: student.user.name,
          nis: student.nis,
          subject: attendance.schedule.subject.name,
          date: attendance.date,
          status: attendance.status,
          note: attendance.note ?? ''
        });
      }
    }
    sheet.insertRow(1, [`Rekap Absensi Kelas ${classData.name} · ${periodLabel}`]);
    sheet.mergeCells(1, 1, 1, 6);
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.getRow(2).eachCell((cell) => { cell.style = headerStyle; });
    sheet.getColumn(4).numFmt = 'dd mmm yyyy';
    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    sheet.autoFilter = { from: 'A2', to: `F${Math.max(2, sheet.rowCount)}` };
  }

  const filenameClass = classData.name.replace(/[^a-zA-Z0-9_-]/g, '-');
  const filename = `rapor-${filenameClass}-${type}-${year}-${String(month).padStart(2, '0')}.xlsx`;
  const file = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  return res.send(Buffer.from(file));
}

export async function createStudent(req: Request, res: Response) {
  const parsed = studentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Data siswa tidak valid' });
  }

  const { name, email, nis, classId, birthDate } = parsed.data;

  const existingStudent = await prisma.student.findUnique({ where: { nis } });
  if (existingStudent) {
    return res.status(409).json({ success: false, message: 'NIS sudah terdaftar' });
  }

  const classRecord = classId ? await prisma.class.findUnique({ where: { id: classId }, select: { name: true } }) : null;
  if (classId && !classRecord) {
    return res.status(400).json({ success: false, message: 'Kelas siswa tidak valid' });
  }

  const username = await generateUniqueUsername(name, classRecord?.name ?? '');
  const finalPassword = generateSafePassword();
  const existingUser = email
    ? await prisma.user.findUnique({ where: { email }, select: { id: true } })
    : null;
  if (existingUser) {
    return res.status(409).json({ success: false, message: 'Email sudah digunakan' });
  }

  const user = await prisma.user.create({
    data: {
      name,
      username,
      email: email || null,
      passwordHash: await hashPassword(finalPassword),
      role: 'SISWA',
      mustChangePassword: true,
      isActive: true
    }
  });

  const student = await prisma.student.create({
    data: {
      userId: user.id,
      nis,
      classId: classId ?? null,
      birthDate: birthDate ? new Date(birthDate) : null
    }
  });

  return res.status(201).json({
    success: true,
    message: 'Siswa berhasil dibuat',
    data: { id: student.id, userId: user.id, username: user.username, password: finalPassword }
  });
}

export async function updateStudent(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  const parsed = studentSchema.partial().safeParse(req.body);
  if (!parsed.success || !id) {
    return res.status(400).json({ success: false, message: 'Data siswa tidak valid' });
  }

  const student = await prisma.student.findUnique({ where: { id }, include: { user: true } });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan' });
  }

  const updates = parsed.data;
  if (updates.username || updates.name || updates.email !== undefined || updates.password) {
    await prisma.user.update({
      where: { id: student.userId },
      data: {
        ...(updates.name ? { name: updates.name } : {}),
        ...(updates.username ? { username: updates.username } : {}),
        ...(updates.email !== undefined ? { email: updates.email || null } : {}),
        ...(updates.password ? { passwordHash: await hashPassword(updates.password) } : {})
      }
    });
  }

  const updatedStudent = await prisma.student.update({
    where: { id },
    data: {
      ...(updates.nis ? { nis: updates.nis } : {}),
      ...(updates.classId ? { classId: updates.classId } : {}),
      ...(updates.birthDate ? { birthDate: new Date(updates.birthDate) } : {})
    }
  });

  return res.json({ success: true, message: 'Siswa berhasil diperbarui', data: updatedStudent });
}

export async function deleteStudent(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID siswa tidak valid' });
  }

  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan' });
  }

  await prisma.user.delete({ where: { id: student.userId } });
  return res.json({ success: true, message: 'Siswa berhasil dihapus' });
}

export async function getTeachers(req: Request, res: Response) {
  const teachers = await prisma.teacher.findMany({
    include: {
      user: true,
      teacherSubjects: { include: { subject: true, class: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.json({
    success: true,
    data: teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.user.name,
      username: teacher.user.username,
      email: teacher.user.email,
      nip: teacher.nip,
      isActive: teacher.user.isActive,
      subjects: teacher.teacherSubjects.map((ts) => ({
        id: ts.id,
        subject: ts.subject.name,
        className: ts.class?.name ?? null
      }))
    }))
  });
}

export async function createTeacher(req: Request, res: Response) {
  const parsed = teacherSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Data guru tidak valid' });
  }

  const { name, email, nip } = parsed.data;
  const subjectIds = [...new Set(parsed.data.subjectIds)];

  try {
    const subjects = await prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true }
    });
    if (subjects.length !== subjectIds.length) {
      return res.status(400).json({ success: false, message: 'Mata pelajaran yang dipilih tidak valid' });
    }

    const username = await generateUniqueUsername(name, nip);
    const finalPassword = generateSafePassword();

    const result = await prisma.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findFirst({
        where: { OR: [{ username }, { email: email || undefined }] },
        select: { id: true }
      });
      if (existingUser) {
        throw new Error('Username atau email sudah digunakan');
      }

      const existingTeacher = await transaction.teacher.findUnique({ where: { nip }, select: { id: true } });
      if (existingTeacher) {
        throw new Error('NIP sudah terdaftar');
      }

      const createdUser = await transaction.user.create({
        data: {
          name,
          username,
          email: email || null,
          passwordHash: await hashPassword(finalPassword),
          role: 'GURU',
          mustChangePassword: true,
          isActive: true
        }
      });
      const teacher = await transaction.teacher.create({
        data: { userId: createdUser.id, nip }
      });

      if (subjectIds.length > 0) {
        await transaction.teacherSubject.createMany({
          data: subjectIds.map((subjectId) => ({ teacherId: teacher.id, subjectId, classId: null }))
        });
      }

      return { teacher, user: createdUser };
    });

    return res.status(201).json({
      success: true,
      message: 'Guru berhasil dibuat',
      data: { id: result.teacher.id, userId: result.user.id, username: result.user.username, password: finalPassword }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Username, email, atau NIP sudah digunakan' });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(400).json({ success: false, message: 'Mata pelajaran atau data guru tidak valid' });
    }
    if (error instanceof Error && ['NIP sudah terdaftar', 'Username atau email sudah digunakan'].includes(error.message)) {
      return res.status(409).json({ success: false, message: error.message });
    }
    console.error('Gagal membuat akun guru:', error);
    return res.status(500).json({ success: false, message: 'Guru gagal dibuat. Periksa data guru dan coba lagi.' });
  }
}

export async function updateTeacher(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  const parsed = teacherSchema.partial().safeParse(req.body);
  if (!parsed.success || !id) {
    return res.status(400).json({ success: false, message: 'Data guru tidak valid' });
  }

  const updates = parsed.data;
  const subjectIds = updates.subjectIds ? [...new Set(updates.subjectIds)] : undefined;

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const teacher = await transaction.teacher.findUnique({ where: { id }, include: { user: true } });
      if (!teacher) return null;

      if (subjectIds) {
        const subjects = await transaction.subject.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true }
        });
        if (subjects.length !== subjectIds.length) {
          throw new Error('Mata pelajaran yang dipilih tidak valid');
        }
        await transaction.teacherSubject.deleteMany({ where: { teacherId: id, classId: null } });
        if (subjectIds.length > 0) {
          await transaction.teacherSubject.createMany({
            data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId, classId: null }))
          });
        }
      }

      if (updates.name || updates.username || updates.email !== undefined || updates.password) {
        await transaction.user.update({
          where: { id: teacher.userId },
          data: {
            ...(updates.name ? { name: updates.name } : {}),
            ...(updates.username ? { username: updates.username } : {}),
            ...(updates.email !== undefined ? { email: updates.email || null } : {}),
            ...(updates.password ? { passwordHash: await hashPassword(updates.password) } : {})
          }
        });
      }

      const updatedTeacher = await transaction.teacher.update({
        where: { id },
        data: updates.nip ? { nip: updates.nip } : {}
      });
      return updatedTeacher;
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Guru tidak ditemukan' });
    }
    return res.json({ success: true, message: 'Guru berhasil diperbarui', data: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Username, email, atau NIP sudah digunakan' });
    }
    if (error instanceof Error && error.message === 'Mata pelajaran yang dipilih tidak valid') {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('Gagal memperbarui data guru:', error);
    return res.status(500).json({ success: false, message: 'Data guru gagal diperbarui' });
  }
}

export async function deleteTeacher(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID guru tidak valid' });
  }

  const teacher = await prisma.teacher.findUnique({ where: { id } });
  if (!teacher) {
    return res.status(404).json({ success: false, message: 'Guru tidak ditemukan' });
  }

  await prisma.user.delete({ where: { id: teacher.userId } });
  return res.json({ success: true, message: 'Guru berhasil dihapus' });
}

export async function getMaterials(req: Request, res: Response) {
  const materials = await prisma.material.findMany({
    include: { subject: true, class: true, uploadedBy: true },
    orderBy: { createdAt: 'desc' }
  });

  return res.json({
    success: true,
    data: materials.map((material) => ({
      id: material.id,
      title: material.title,
      type: material.type,
      fileUrl: material.fileUrl,
      weekNumber: material.weekNumber,
      subject: material.subject.name,
      className: material.class.name,
      uploadedBy: material.uploadedBy.name,
      availableFrom: material.availableFrom,
      availableUntil: material.availableUntil
    }))
  });
}

export async function createMaterial(req: Request, res: Response) {
  const parsed = materialSchema.safeParse(req.body);
  if (!parsed.success || new Date(parsed.data.availableUntil) <= new Date(parsed.data.availableFrom)) {
    return res.status(400).json({ success: false, message: 'Data materi tidak valid' });
  }

  if (parsed.data.type === 'PDF' && (
    !req.file ||
    req.file.mimetype !== 'application/pdf' ||
    !req.file.originalname.toLowerCase().endsWith('.pdf') ||
    req.file.buffer.subarray(0, 5).toString() !== '%PDF-'
  )) {
    return res.status(400).json({ success: false, message: 'Unggah file PDF yang valid' });
  }
  if (parsed.data.type === 'VIDEO' && (!parsed.data.fileUrl || req.file)) {
    return res.status(400).json({ success: false, message: 'Tautan video wajib diisi dan tidak menerima unggahan file' });
  }

  const id = crypto.randomUUID();
  const fileUrl = parsed.data.type === 'PDF' ? `/api/content/materials/${id}/file` : parsed.data.fileUrl!;

  try {
    if (req.file) {
      await saveMaterialFile(id, req.file.buffer);
    }

    const material = await prisma.material.create({
      data: {
        id,
        title: parsed.data.title,
        type: parsed.data.type,
        fileUrl,
        subjectId: parsed.data.subjectId,
        classId: parsed.data.classId,
        weekNumber: parsed.data.weekNumber,
        availableFrom: new Date(parsed.data.availableFrom),
        availableUntil: new Date(parsed.data.availableUntil),
        uploadedById: req.user?.id ?? ''
      }
    });

    return res.status(201).json({ success: true, message: 'Materi berhasil dibuat', data: material });
  } catch (error) {
    if (req.file) await removeMaterialFile(id);
    console.error(error);
    return res.status(500).json({ success: false, message: 'Materi gagal disimpan' });
  }
}

export async function updateMaterial(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  const parsed = materialSchema.partial().safeParse(req.body);
  if (!parsed.success || !id) {
    return res.status(400).json({ success: false, message: 'Data materi tidak valid' });
  }

  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) {
    return res.status(404).json({ success: false, message: 'Materi tidak ditemukan' });
  }

  const updated = await prisma.material.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(parsed.data.fileUrl ? { fileUrl: parsed.data.fileUrl } : {}),
      ...(parsed.data.subjectId ? { subjectId: parsed.data.subjectId } : {}),
      ...(parsed.data.classId ? { classId: parsed.data.classId } : {}),
      ...(parsed.data.weekNumber !== undefined ? { weekNumber: parsed.data.weekNumber } : {}),
      ...(parsed.data.availableFrom ? { availableFrom: new Date(parsed.data.availableFrom) } : {}),
      ...(parsed.data.availableUntil ? { availableUntil: new Date(parsed.data.availableUntil) } : {})
    }
  });

  return res.json({ success: true, message: 'Materi berhasil diperbarui', data: updated });
}

export async function deleteMaterial(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID materi tidak valid' });
  }

  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) {
    return res.status(404).json({ success: false, message: 'Materi tidak ditemukan' });
  }

  await prisma.material.delete({ where: { id } });
  await removeMaterialFile(id);
  return res.json({ success: true, message: 'Materi berhasil dihapus' });
}

export async function getResetRequests(req: Request, res: Response) {
  const requests = await prisma.passwordResetRequest.findMany({
    include: {
      student: {
        include: {
          user: true,
          class: true
        }
      },
      handledBy: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.json({
    success: true,
    data: requests.map((request) => ({
      id: request.id,
      status: request.status,
      createdAt: request.createdAt,
      handledAt: request.handledAt,
      student: {
        id: request.student.id,
        nis: request.student.nis,
        name: request.student.user.name,
        className: request.student.class?.name ?? null
      },
      handledBy: request.handledBy ? request.handledBy.name : null
    }))
  });
}

export async function approveResetRequest(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  const parsed = resetDecisionSchema.safeParse(req.body);
  if (!parsed.success || !id) {
    return res.status(400).json({ success: false, message: 'Status keputusan tidak valid' });
  }

  const request = await prisma.passwordResetRequest.findUnique({
    where: { id },
    include: { student: { include: { user: true } } }
  });

  if (!request) {
    return res.status(404).json({ success: false, message: 'Permintaan reset tidak ditemukan' });
  }

  if (parsed.data.status === 'APPROVED') {
    const temporaryPassword = generateTemporaryPassword();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: request.student.userId },
        data: {
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
          passwordChangedAt: new Date()
        }
      }),
      prisma.passwordResetRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          handledById: req.user?.id,
          handledAt: new Date()
        }
      }),
      prisma.auditLog.create({
        data: {
          actorId: req.user?.id,
          action: 'APPROVE_STUDENT_PASSWORD_RESET',
          targetUserId: request.student.userId,
          ip: req.ip ?? 'unknown'
        }
      })
    ]);

    return res.json({
      success: true,
      message: 'Permintaan reset disetujui',
      data: {
        requestId: id,
        temporaryPassword,
        mustChangePassword: true
      }
    });
  }

  await prisma.$transaction([
    prisma.passwordResetRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        handledById: req.user?.id,
        handledAt: new Date()
      }
    }),
    prisma.auditLog.create({
      data: {
        actorId: req.user?.id,
        action: 'REJECT_STUDENT_PASSWORD_RESET',
        targetUserId: request.student.userId,
        ip: req.ip ?? 'unknown'
      }
    })
  ]);

  return res.json({ success: true, message: 'Permintaan reset ditolak', data: { requestId: id } });
}

export async function resetUserPassword(req: Request, res: Response) {
  const id = normalizeString(req.params.id);

  if (!id) {
    return res.status(400).json({ success: false, message: 'User ID tidak valid' });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date()
      }
    }),
    prisma.auditLog.create({
      data: {
        actorId: req.user?.id,
        action: 'ADMIN_RESET_PASSWORD',
        targetUserId: id,
        ip: req.ip ?? 'unknown'
      }
    })
  ]);

  return res.json({
    success: true,
    message: 'Password sementara berhasil dibuat',
    data: {
      userId: id,
      temporaryPassword,
      mustChangePassword: true
    }
  });
}

export async function getTryouts(req: Request, res: Response) {
  const tryouts = await prisma.tryout.findMany({
    include: { class: true, questions: true },
    orderBy: { startAt: 'desc' }
  });

  return res.json({
    success: true,
    data: tryouts.map((tryout) => ({
      id: tryout.id,
      title: tryout.title,
      accessCode: tryout.accessCode,
      classId: tryout.classId,
      durationMinutes: tryout.durationMinutes,
      startAt: tryout.startAt,
      endAt: tryout.endAt,
      className: tryout.class.name,
      questionCount: tryout.questions.length,
      shuffleQuestions: tryout.shuffleQuestions,
      certificateEnabled: tryout.certificateEnabled,
      certificateMinimumScore: tryout.certificateMinimumScore,
      certificateSignerName: tryout.certificateSignerName ?? '',
      certificateSignerTitle: tryout.certificateSignerTitle ?? ''
    }))
  });
}

export async function getTryoutDetail(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID tryout tidak valid' });
  }

  const tryout = await prisma.tryout.findUnique({
    where: { id },
    include: {
      class: true,
      questions: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!tryout) {
    return res.status(404).json({ success: false, message: 'Tryout tidak ditemukan' });
  }

  return res.json({
    success: true,
    data: {
      id: tryout.id,
      title: tryout.title,
      accessCode: tryout.accessCode,
      classId: tryout.classId,
      className: tryout.class.name,
      durationMinutes: tryout.durationMinutes,
      startAt: tryout.startAt,
      endAt: tryout.endAt,
      shuffleQuestions: tryout.shuffleQuestions,
      certificateEnabled: tryout.certificateEnabled,
      certificateMinimumScore: tryout.certificateMinimumScore,
      certificateSignerName: tryout.certificateSignerName ?? '',
      certificateSignerTitle: tryout.certificateSignerTitle ?? '',
      questions: tryout.questions.map((q) => ({
        id: q.id,
        type: q.type,
        text: q.text,
        imageUrl: q.imageUrl,
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correctAnswer,
        points: q.points,
        explanation: q.explanation ?? '',
        explanationImageUrl: q.explanationImageUrl
      }))
    }
  });
}

const tryoutCertificateSchema = z.object({
  certificateEnabled: z.boolean(),
  certificateMinimumScore: z.number().min(0).max(100),
  certificateSignerName: z.string().trim().max(120),
  certificateSignerTitle: z.string().trim().max(120)
});

export async function updateTryoutCertificateSettings(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID tryout tidak valid' });
  }

  const parsed = tryoutCertificateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Pengaturan sertifikat tidak valid' });
  }

  const existing = await prisma.tryout.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Tryout tidak ditemukan' });
  }

  const tryout = await prisma.tryout.update({
    where: { id },
    data: {
      certificateEnabled: parsed.data.certificateEnabled,
      certificateMinimumScore: parsed.data.certificateMinimumScore,
      certificateSignerName: parsed.data.certificateSignerName || null,
      certificateSignerTitle: parsed.data.certificateSignerTitle || null
    }
  });

  return res.json({
    success: true,
    message: 'Pengaturan sertifikat berhasil disimpan',
    data: {
      id: tryout.id,
      certificateEnabled: tryout.certificateEnabled,
      certificateMinimumScore: tryout.certificateMinimumScore,
      certificateSignerName: tryout.certificateSignerName ?? '',
      certificateSignerTitle: tryout.certificateSignerTitle ?? ''
    }
  });
}

export async function exportNewAccountCredentials(req: Request, res: Response) {
  const parsed = credentialExportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Data kredensial untuk diekspor tidak valid' });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Learning Management System Cakrawala';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Akun Baru');
  sheet.columns = [
    { header: 'Peran', key: 'role', width: 14 },
    { header: 'Nama', key: 'name', width: 30 },
    { header: 'NIS / NIP', key: 'identifier', width: 20 },
    { header: 'Kelas', key: 'className', width: 16 },
    { header: 'Username', key: 'username', width: 28 },
    { header: 'Password sementara', key: 'password', width: 24 }
  ];

  const safeCellText = (value: string | undefined) => {
    const text = value ?? '';
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  };

  for (const account of parsed.data.accounts) {
    sheet.addRow({
      role: account.role,
      name: safeCellText(account.name),
      identifier: safeCellText(account.identifier),
      className: safeCellText(account.className),
      username: safeCellText(account.username),
      password: account.password
    });
  }

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' }
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `F${sheet.rowCount}` };
  sheet.getColumn('password').numFmt = '@';

  const file = await workbook.xlsx.writeBuffer();
  const filename = `kredensial-akun-baru-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(Buffer.from(file));
}

function detectImageExtension(file: Express.Multer.File): 'png' | 'jpg' | 'webp' | null {
  if (!file.buffer || file.buffer.length < 8) return null;
  if (file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'png';
  }
  if (file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    file.buffer.toString('ascii', 0, 4) === 'RIFF' &&
    file.buffer.length >= 12 &&
    file.buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  if (file.mimetype === 'image/png') return 'png';
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg' || file.mimetype === 'image/pjpeg') return 'jpg';
  if (file.mimetype === 'image/webp') return 'webp';
  return null;
}

export async function createTryout(req: Request, res: Response) {
  let payload = req.body;
  if (typeof req.body.payload === 'string') {
    try {
      payload = JSON.parse(req.body.payload);
    } catch {
      return res.status(400).json({ success: false, message: 'Data TryOut tidak dapat dibaca' });
    }
  }

  const parsed = tryoutSchema.safeParse(payload);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Data tryout tidak valid', errors: parsed.error.format() });
  }

  const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
  const questionFiles = files.filter((f) => f.fieldname === 'questionImages');
  const explanationFiles = files.filter((f) => f.fieldname === 'explanationImages');

  const questionExtensions: string[] = [];
  for (const file of questionFiles) {
    const ext = detectImageExtension(file);
    if (!ext) {
      return res.status(400).json({ success: false, message: 'Gambar soal harus berupa PNG, JPEG, atau WebP yang valid' });
    }
    questionExtensions.push(ext);
  }

  const explanationExtensions: string[] = [];
  for (const file of explanationFiles) {
    const ext = detectImageExtension(file);
    if (!ext) {
      return res.status(400).json({ success: false, message: 'Gambar pembahasan harus berupa PNG, JPEG, atau WebP yang valid' });
    }
    explanationExtensions.push(ext);
  }

  for (const q of parsed.data.questions) {
    if (q.questionImageIndex !== undefined && (q.questionImageIndex < 0 || q.questionImageIndex >= questionFiles.length)) {
      return res.status(400).json({ success: false, message: 'Gambar soal tidak cocok dengan data soal' });
    }
    if (q.explanationImageIndex !== undefined && (q.explanationImageIndex < 0 || q.explanationImageIndex >= explanationFiles.length)) {
      return res.status(400).json({ success: false, message: 'Gambar pembahasan tidak cocok dengan data soal' });
    }
  }

  const savedQuestionFilenames = questionExtensions.map((ext) => `${crypto.randomUUID()}.${ext}`);
  const savedExplanationFilenames = explanationExtensions.map((ext) => `${crypto.randomUUID()}.${ext}`);

  const { questions, ...tryoutPayload } = parsed.data;
  let accessCode = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    accessCode = Array.from(crypto.randomBytes(8), (byte) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[byte & 31]).join('');
    if (!await prisma.tryout.findUnique({ where: { accessCode }, select: { id: true } })) break;
    accessCode = '';
  }
  if (!accessCode) {
    return res.status(500).json({ success: false, message: 'Kode akses TryOut gagal dibuat. Silakan coba lagi.' });
  }

  try {
    if (questionFiles.length > 0) {
      await Promise.all(questionFiles.map((file, idx) => saveQuestionImage(savedQuestionFilenames[idx], file.buffer)));
    }
    if (explanationFiles.length > 0) {
      await Promise.all(explanationFiles.map((file, idx) => saveExplanationImage(savedExplanationFilenames[idx], file.buffer)));
    }

    const tryout = await prisma.tryout.create({
      data: {
        ...tryoutPayload,
        accessCode,
        startAt: new Date(payload.startAt),
        endAt: new Date(payload.endAt),
        questions: {
          create: questions.map((question) => {
            let questionImageUrl = question.imageUrl ?? null;
            if (question.questionImageIndex !== undefined && savedQuestionFilenames[question.questionImageIndex]) {
              questionImageUrl = `/api/content/tryout-questions/${savedQuestionFilenames[question.questionImageIndex]}`;
            }

            let explanationImageUrl = null;
            if (question.explanationImageIndex !== undefined && savedExplanationFilenames[question.explanationImageIndex]) {
              explanationImageUrl = `/api/content/tryout-explanations/${savedExplanationFilenames[question.explanationImageIndex]}`;
            }

            return {
              type: question.type,
              text: question.text,
              imageUrl: questionImageUrl,
              options: question.options,
              correctAnswer: question.correctAnswer,
              points: question.points,
              explanation: question.explanation ?? null,
              explanationImageUrl
            };
          })
        }
      },
      include: { class: true, questions: true }
    });

    if (socketState.io) {
      socketState.io.emit('tryout:opened', {
        id: tryout.id,
        title: tryout.title,
        classId: tryout.classId,
        startAt: tryout.startAt,
        endAt: tryout.endAt,
        message: 'Tryout baru telah dibuka'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Tryout berhasil dibuat',
      data: {
        id: tryout.id,
        title: tryout.title,
        accessCode: tryout.accessCode,
        questionCount: tryout.questions.length,
        certificateEnabled: tryout.certificateEnabled
      }
    });
  } catch (error) {
    await Promise.all([
      ...savedQuestionFilenames.map((f) => removeQuestionImage(f)),
      ...savedExplanationFilenames.map((f) => removeExplanationImage(f))
    ]);
    console.error('Gagal membuat TryOut:', error);
    return res.status(500).json({ success: false, message: 'TryOut gagal disimpan. Periksa data lalu coba lagi.' });
  }
}

export async function updateTryout(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID tryout tidak valid' });
  }

  const existing = await prisma.tryout.findUnique({
    where: { id },
    include: { questions: true }
  });
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Tryout tidak ditemukan' });
  }

  let payload = req.body;
  if (typeof req.body.payload === 'string') {
    try {
      payload = JSON.parse(req.body.payload);
    } catch {
      return res.status(400).json({ success: false, message: 'Data TryOut tidak dapat dibaca' });
    }
  }

  const parsed = tryoutSchema.safeParse(payload);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Data tryout tidak valid', errors: parsed.error.format() });
  }

  const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
  const questionFiles = files.filter((f) => f.fieldname === 'questionImages');
  const explanationFiles = files.filter((f) => f.fieldname === 'explanationImages');

  const questionExtensions: string[] = [];
  for (const file of questionFiles) {
    const ext = detectImageExtension(file);
    if (!ext) {
      return res.status(400).json({ success: false, message: 'Gambar soal harus berupa PNG, JPEG, atau WebP yang valid' });
    }
    questionExtensions.push(ext);
  }

  const explanationExtensions: string[] = [];
  for (const file of explanationFiles) {
    const ext = detectImageExtension(file);
    if (!ext) {
      return res.status(400).json({ success: false, message: 'Gambar pembahasan harus berupa PNG, JPEG, atau WebP yang valid' });
    }
    explanationExtensions.push(ext);
  }

  for (const q of parsed.data.questions) {
    if (q.questionImageIndex !== undefined && (q.questionImageIndex < 0 || q.questionImageIndex >= questionFiles.length)) {
      return res.status(400).json({ success: false, message: 'Gambar soal tidak cocok dengan data soal' });
    }
    if (q.explanationImageIndex !== undefined && (q.explanationImageIndex < 0 || q.explanationImageIndex >= explanationFiles.length)) {
      return res.status(400).json({ success: false, message: 'Gambar pembahasan tidak cocok dengan data soal' });
    }
  }

  const savedQuestionFilenames = questionExtensions.map((ext) => `${crypto.randomUUID()}.${ext}`);
  const savedExplanationFilenames = explanationExtensions.map((ext) => `${crypto.randomUUID()}.${ext}`);

  const { questions, ...tryoutPayload } = parsed.data;

  try {
    if (questionFiles.length > 0) {
      await Promise.all(questionFiles.map((file, idx) => saveQuestionImage(savedQuestionFilenames[idx], file.buffer)));
    }
    if (explanationFiles.length > 0) {
      await Promise.all(explanationFiles.map((file, idx) => saveExplanationImage(savedExplanationFilenames[idx], file.buffer)));
    }

    const newQuestionImageUrls = new Set<string>();
    const newExplanationImageUrls = new Set<string>();

    const updatedQuestions = questions.map((question) => {
      let questionImageUrl = question.existingImageUrl ?? null;
      if (question.questionImageIndex !== undefined && savedQuestionFilenames[question.questionImageIndex]) {
        questionImageUrl = `/api/content/tryout-questions/${savedQuestionFilenames[question.questionImageIndex]}`;
      }
      if (questionImageUrl) newQuestionImageUrls.add(questionImageUrl);

      let explanationImageUrl = question.existingExplanationImageUrl ?? null;
      if (question.explanationImageIndex !== undefined && savedExplanationFilenames[question.explanationImageIndex]) {
        explanationImageUrl = `/api/content/tryout-explanations/${savedExplanationFilenames[question.explanationImageIndex]}`;
      }
      if (explanationImageUrl) newExplanationImageUrls.add(explanationImageUrl);

      return {
        type: question.type,
        text: question.text,
        imageUrl: questionImageUrl,
        options: question.options,
        correctAnswer: question.correctAnswer,
        points: question.points,
        explanation: question.explanation ?? null,
        explanationImageUrl
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.tryout.update({
        where: { id },
        data: {
          ...tryoutPayload,
          startAt: new Date(payload.startAt),
          endAt: new Date(payload.endAt)
        }
      });

      await tx.question.deleteMany({ where: { tryoutId: id } });

      await tx.question.createMany({
        data: updatedQuestions.map((q) => ({
          tryoutId: id,
          ...q
        }))
      });
    });

    // Cleanup old orphan image files
    for (const oldQ of existing.questions) {
      if (oldQ.imageUrl && !newQuestionImageUrls.has(oldQ.imageUrl) && oldQ.imageUrl.startsWith('/api/content/tryout-questions/')) {
        const fn = oldQ.imageUrl.split('/').pop();
        if (fn) void removeQuestionImage(fn).catch(() => {});
      }
      if (oldQ.explanationImageUrl && !newExplanationImageUrls.has(oldQ.explanationImageUrl) && oldQ.explanationImageUrl.startsWith('/api/content/tryout-explanations/')) {
        const fn = oldQ.explanationImageUrl.split('/').pop();
        if (fn) void removeExplanationImage(fn).catch(() => {});
      }
    }

    return res.json({
      success: true,
      message: 'Tryout dan soal berhasil diperbarui',
      data: { id }
    });
  } catch (error) {
    await Promise.all([
      ...savedQuestionFilenames.map((f) => removeQuestionImage(f)),
      ...savedExplanationFilenames.map((f) => removeExplanationImage(f))
    ]);
    console.error('Gagal memperbarui TryOut:', error);
    return res.status(500).json({ success: false, message: 'TryOut gagal diperbarui. Periksa data lalu coba lagi.' });
  }
}

export async function deleteTryout(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID tryout tidak valid' });
  }

  const existing = await prisma.tryout.findUnique({
    where: { id },
    include: { questions: true }
  });

  if (!existing) {
    return res.status(404).json({ success: false, message: 'Tryout tidak ditemukan' });
  }

  for (const q of existing.questions) {
    if (q.imageUrl && q.imageUrl.startsWith('/api/content/tryout-questions/')) {
      const fn = q.imageUrl.split('/').pop();
      if (fn) void removeQuestionImage(fn).catch(() => {});
    }
    if (q.explanationImageUrl && q.explanationImageUrl.startsWith('/api/content/tryout-explanations/')) {
      const fn = q.explanationImageUrl.split('/').pop();
      if (fn) void removeExplanationImage(fn).catch(() => {});
    }
  }

  await prisma.tryout.delete({ where: { id } });

  return res.json({ success: true, message: 'Tryout berhasil dihapus' });
}

export async function getTryoutMonitoring(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID tryout tidak valid' });
  }

  const tryout = await prisma.tryout.findUnique({
    where: { id },
    include: { attempts: { include: { student: { include: { user: true } } } } }
  });

  if (!tryout) {
    return res.status(404).json({ success: false, message: 'Tryout tidak ditemukan' });
  }

  const online = Array.isArray((socketState.io as any)?.sockets?.sockets)
    ? (socketState.io as any).sockets.sockets.size
    : 0;

  return res.json({
    success: true,
    data: {
      id: tryout.id,
      title: tryout.title,
      onlineStudents: online,
      attempts: tryout.attempts.map((attempt) => ({
        id: attempt.id,
        studentName: attempt.student.user.name,
        nis: attempt.student.nis,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        score: attempt.score
      }))
    }
  });
}

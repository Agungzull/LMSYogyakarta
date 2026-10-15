import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';

const attendanceSchema = z.object({
  scheduleId: z.string().min(1),
  date: z.string().min(1),
  records: z.array(
    z.object({
      studentId: z.string().min(1),
      status: z.enum(['HADIR', 'IZIN', 'SAKIT', 'ALPA']),
      note: z.string().optional()
    })
  )
});

const scoreSchema = z.object({
  studentId: z.string().min(1),
  subjectId: z.string().min(1),
  date: z.string().min(1),
  score: z.number().min(0).max(100),
  activityScore: z.number().int().min(1).max(5).optional(),
  note: z.string().optional()
});

const feedbackSchema = z.object({
  message: z.string().min(5)
});

const resetDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'])
});

function normalizeString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getTeacherIdByUserId(userId: string) {
  const teacher = await prisma.teacher.findUnique({ where: { userId: userId } });
  return teacher?.id ?? null;
}

export async function getMySchedules(req: Request, res: Response) {
  const teacherId = await getTeacherIdByUserId(req.user?.id ?? '');
  if (!teacherId) {
    return res.status(403).json({ success: false, message: 'Akun guru tidak terdaftar' });
  }

  const schedules = await prisma.schedule.findMany({
    where: { teacherId },
    include: { class: true, subject: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
  });

  return res.json({
    success: true,
    data: schedules.map((schedule) => ({
      id: schedule.id,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      className: schedule.class.name,
      subjectName: schedule.subject.name
    }))
  });
}

export async function getAttendance(req: Request, res: Response) {
  const teacherId = await getTeacherIdByUserId(req.user?.id ?? '');
  if (!teacherId) {
    return res.status(403).json({ success: false, message: 'Akun guru tidak terdaftar' });
  }

  const scheduleId = normalizeString(req.query.scheduleId as string | string[] | undefined);
  const date = normalizeString(req.query.date as string | string[] | undefined) ?? new Date().toISOString();

  if (!scheduleId) {
    const schedules = await prisma.schedule.findMany({
      where: { teacherId },
      include: { class: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
    });
    return res.json({ success: true, data: schedules });
  }

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, teacherId },
    include: { class: true }
  });

  if (!schedule) {
    return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan' });
  }

  const students = await prisma.student.findMany({
    where: { classId: schedule.classId },
    include: { user: true }
  });

  const attendance = await prisma.attendance.findMany({
    where: {
      scheduleId,
      date: new Date(date)
    },
    include: { student: { include: { user: true } } }
  });

  return res.json({
    success: true,
    data: {
      schedule: {
        id: schedule.id,
        className: schedule.class.name,
        subjectId: schedule.subjectId,
        teacherId: schedule.teacherId
      },
      students: students.map((student) => {
        const current = attendance.find((item) => item.studentId === student.id);
        return {
          studentId: student.id,
          nis: student.nis,
          name: student.user.name,
          status: current?.status ?? null,
          note: current?.note ?? null
        };
      })
    }
  });
}

export async function submitAttendance(req: Request, res: Response) {
  const parsed = attendanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Data absensi tidak valid' });
  }

  const teacherId = await getTeacherIdByUserId(req.user?.id ?? '');
  if (!teacherId) {
    return res.status(403).json({ success: false, message: 'Akun guru tidak terdaftar' });
  }

  const schedule = await prisma.schedule.findFirst({
    where: { id: parsed.data.scheduleId, teacherId },
    include: { class: true }
  });

  if (!schedule) {
    return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan untuk guru ini' });
  }

  const date = new Date(parsed.data.date);
  const results = [] as Array<{ studentId: string; status: string; note: string | null }>;

  for (const record of parsed.data.records) {
    const student = await prisma.student.findFirst({
      where: { id: record.studentId, classId: schedule.classId }
    });

    if (!student) {
      continue;
    }

    const attendance = await prisma.attendance.upsert({
      where: {
        scheduleId_studentId_date: {
          scheduleId: parsed.data.scheduleId,
          studentId: record.studentId,
          date
        }
      },
      update: {
        status: record.status,
        note: record.note ?? null
      },
      create: {
        scheduleId: parsed.data.scheduleId,
        studentId: record.studentId,
        date,
        status: record.status,
        note: record.note ?? null
      }
    });

    results.push({
      studentId: attendance.studentId,
      status: attendance.status,
      note: attendance.note ?? null
    });
  }

  return res.json({
    success: true,
    message: 'Absensi berhasil disimpan',
    data: results
  });
}

export async function getDailyScores(req: Request, res: Response) {
  const teacherId = await getTeacherIdByUserId(req.user?.id ?? '');
  if (!teacherId) {
    return res.status(403).json({ success: false, message: 'Akun guru tidak terdaftar' });
  }

  const subjectId = normalizeString(req.query.subjectId as string | string[] | undefined);
  const scores = await prisma.dailyScore.findMany({
    where: {
      teacherId,
      ...(subjectId ? { subjectId } : {})
    },
    include: {
      student: { include: { user: true, class: true } },
      subject: true
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
  });

  return res.json({
    success: true,
    data: scores.map((score) => ({
      id: score.id,
      date: score.date,
      score: score.score,
      activityScore: score.activityScore,
      note: score.note,
      subjectName: score.subject.name,
      studentName: score.student.user.name,
      className: score.student.class?.name ?? null
    }))
  });
}

export async function createDailyScore(req: Request, res: Response) {
  const parsed = scoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Data nilai harian tidak valid' });
  }

  const teacherId = await getTeacherIdByUserId(req.user?.id ?? '');
  if (!teacherId) {
    return res.status(403).json({ success: false, message: 'Akun guru tidak terdaftar' });
  }

  const date = new Date(parsed.data.date);
  const score = await prisma.dailyScore.upsert({
    where: {
      studentId_subjectId_date: {
        studentId: parsed.data.studentId,
        subjectId: parsed.data.subjectId,
        date
      }
    },
    update: {
      score: parsed.data.score,
      activityScore: parsed.data.activityScore ?? null,
      note: parsed.data.note ?? null,
      teacherId
    },
    create: {
      studentId: parsed.data.studentId,
      subjectId: parsed.data.subjectId,
      teacherId,
      date,
      score: parsed.data.score,
      activityScore: parsed.data.activityScore ?? null,
      note: parsed.data.note ?? null
    }
  });

  return res.status(201).json({
    success: true,
    message: 'Nilai harian berhasil disimpan',
    data: score
  });
}

export async function getMaterialsForTeacher(req: Request, res: Response) {
  const teacherId = await getTeacherIdByUserId(req.user?.id ?? '');
  if (!teacherId) {
    return res.status(403).json({ success: false, message: 'Akun guru tidak terdaftar' });
  }

  const teacherSubjects = await prisma.teacherSubject.findMany({
    where: { teacherId },
    select: { subjectId: true, classId: true }
  });

  const orClause = teacherSubjects
    .filter((subject) => subject.classId)
    .map((subject) => ({
      subjectId: subject.subjectId,
      classId: subject.classId as string
    }));

  const materials = await prisma.material.findMany({
    where: orClause.length > 0 ? { OR: orClause } : { subjectId: teacherSubjects[0]?.subjectId ?? '' },
    include: { subject: true, class: true },
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
      subjectName: material.subject.name,
      className: material.class.name,
      availableFrom: material.availableFrom,
      availableUntil: material.availableUntil
    }))
  });
}

export async function createFeedback(req: Request, res: Response) {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Pesan tidak valid' });
  }

  const userId = req.user?.id ?? '';
  const feedback = await prisma.feedback.create({
    data: {
      userId,
      role: 'GURU',
      message: parsed.data.message,
      status: 'PENDING'
    }
  });

  return res.status(201).json({
    success: true,
    message: 'Saran berhasil dikirim',
    data: feedback
  });
}

export async function getTeacherResetRequests(req: Request, res: Response) {
  const teacherId = await getTeacherIdByUserId(req.user?.id ?? '');
  if (!teacherId) {
    return res.status(403).json({ success: false, message: 'Akun guru tidak terdaftar' });
  }

  const teacherClasses = await prisma.teacherSubject.findMany({
    where: { teacherId },
    select: { classId: true }
  });

  const classIds = teacherClasses.filter((x) => x.classId).map((x) => x.classId as string);
  if (classIds.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const requests = await prisma.passwordResetRequest.findMany({
    where: {
      student: { classId: { in: classIds } },
      status: 'PENDING'
    },
    include: {
      student: { include: { user: true, class: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.json({
    success: true,
    data: requests.map((request) => ({
      id: request.id,
      status: request.status,
      createdAt: request.createdAt,
      student: {
        id: request.student.id,
        name: request.student.user.name,
        nis: request.student.nis,
        className: request.student.class?.name ?? null
      }
    }))
  });
}

export async function processTeacherResetRequest(req: Request, res: Response) {
  const id = normalizeString(req.params.id);
  const parsed = resetDecisionSchema.safeParse(req.body);
  if (!parsed.success || !id) {
    return res.status(400).json({ success: false, message: 'Keputusan reset tidak valid' });
  }

  const teacherId = await getTeacherIdByUserId(req.user?.id ?? '');
  if (!teacherId) {
    return res.status(403).json({ success: false, message: 'Akun guru tidak terdaftar' });
  }

  const teacherClasses = await prisma.teacherSubject.findMany({
    where: { teacherId },
    select: { classId: true }
  });

  const classIds = teacherClasses.filter((x) => x.classId).map((x) => x.classId as string);
  const request = await prisma.passwordResetRequest.findFirst({
    where: {
      id,
      student: { classId: { in: classIds } },
      status: 'PENDING'
    },
    include: { student: { include: { user: true } } }
  });

  if (!request) {
    return res.status(404).json({ success: false, message: 'Permintaan reset tidak ditemukan atau tidak ada di kelas Anda' });
  }

  if (parsed.data.status === 'APPROVED') {
    const tempPassword = crypto.randomBytes(5).toString('hex') + 'Ab1!';
    await prisma.$transaction([
      prisma.user.update({
        where: { id: request.student.userId },
        data: {
          passwordHash: await hashPassword(tempPassword),
          mustChangePassword: true,
          passwordChangedAt: new Date()
        }
      }),
      prisma.passwordResetRequest.update({
        where: { id },
        data: { status: 'APPROVED', handledById: req.user?.id, handledAt: new Date() }
      })
    ]);

    return res.json({
      success: true,
      message: 'Permintaan reset disetujui',
      data: { requestId: id, temporaryPassword: tempPassword }
    });
  }

  await prisma.passwordResetRequest.update({
    where: { id },
    data: { status: 'REJECTED', handledById: req.user?.id, handledAt: new Date() }
  });

  return res.json({ success: true, message: 'Permintaan reset ditolak', data: { requestId: id } });
}

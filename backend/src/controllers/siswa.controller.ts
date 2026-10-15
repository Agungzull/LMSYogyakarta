import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { socketState } from '../lib/socket-state.js';

const feedbackSchema = z.object({
  message: z.string().min(5)
});

const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedAnswer: z.union([z.string(), z.array(z.string())]).optional()
});

const tryoutStartSchema = z.object({
  accessCode: z.string().trim().min(1).max(32)
});

function normalizeString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getStudentByUserId(userId: string) {
  return prisma.student.findUnique({
    where: { userId: userId },
    include: { user: true, class: true }
  });
}

function isContentOpen(material: { availableFrom: Date; availableUntil: Date }) {
  const now = new Date();
  return now >= material.availableFrom && now <= material.availableUntil;
}

function getContentMessage(material: { availableFrom: Date; availableUntil: Date; isOpen: boolean }) {
  if (material.isOpen) return 'Tersedia';
  if (new Date() < material.availableFrom) {
    return `Terkunci sampai ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(material.availableFrom)}`;
  }
  return 'Masa akses berakhir';
}

function parseMultipleChoiceAnswer(value: string | null): string[] {
  if (value === null) return [];
  try {
    const answer: unknown = JSON.parse(value);
    return Array.isArray(answer) && answer.every((item): item is string => typeof item === 'string')
      ? answer
      : [];
  } catch {
    return [];
  }
}

function answersMatchExactly(selectedAnswers: string[], correctAnswers: string[]) {
  return selectedAnswers.length === correctAnswers.length
    && selectedAnswers.every((answer) => correctAnswers.includes(answer));
}

export async function getStudentDashboard(req: Request, res: Response) {
  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  return res.json({
    success: true,
    data: {
      studentName: student.user?.name ?? null,
      className: student.class?.name ?? null,
      scheduleCount: await prisma.schedule.count({ where: { classId: student.classId ?? '' } }),
      materialCount: await prisma.material.count({ where: { classId: student.classId ?? '' } }),
      videoCount: await prisma.material.count({ where: { classId: student.classId ?? '', type: 'VIDEO' } }),
      tryoutCount: await prisma.tryout.count({ where: { classId: student.classId ?? '' } })
    }
  });
}

export async function getStudentSchedules(req: Request, res: Response) {
  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  const schedules = await prisma.schedule.findMany({
    where: { classId: student.classId ?? '' },
    include: { subject: true, teacher: { include: { user: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
  });

  return res.json({
    success: true,
    data: schedules.map((schedule) => ({
      id: schedule.id,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      subjectName: schedule.subject.name,
      teacherName: schedule.teacher.user.name
    }))
  });
}

export async function getAvailableMaterials(req: Request, res: Response) {
  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  const materials = await prisma.material.findMany({
    where: {
      classId: student.classId ?? '',
      type: 'PDF'
    },
    include: { subject: true },
    orderBy: { createdAt: 'desc' }
  });

  const items = materials.map((material) => {
    const isOpen = isContentOpen(material);
    return {
      id: material.id,
      title: material.title,
      subjectName: material.subject.name,
      fileUrl: isOpen ? material.fileUrl : null,
      weekNumber: material.weekNumber,
      availableFrom: material.availableFrom,
      availableUntil: material.availableUntil,
      isOpen,
      message: getContentMessage({ ...material, isOpen })
    };
  });

  return res.json({ success: true, data: items });
}

export async function getAvailableVideos(req: Request, res: Response) {
  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  const materials = await prisma.material.findMany({
    where: {
      classId: student.classId ?? '',
      type: 'VIDEO'
    },
    include: { subject: true },
    orderBy: { createdAt: 'desc' }
  });

  const items = materials.map((material) => {
    const isOpen = isContentOpen(material);
    return {
      id: material.id,
      title: material.title,
      subjectName: material.subject.name,
      fileUrl: isOpen ? material.fileUrl : null,
      weekNumber: material.weekNumber,
      availableFrom: material.availableFrom,
      availableUntil: material.availableUntil,
      isOpen,
      message: getContentMessage({ ...material, isOpen })
    };
  });

  return res.json({ success: true, data: items });
}

export async function getStudentTryouts(req: Request, res: Response) {
  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  const tryouts = await prisma.tryout.findMany({
    where: { classId: student.classId ?? '' },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      durationMinutes: true
    },
    orderBy: { startAt: 'asc' }
  });

  const items = tryouts.map((item) => {
    const now = new Date();
    const isOpen = now >= item.startAt && now <= item.endAt;
    return {
      id: item.id,
      title: item.title,
      startAt: item.startAt,
      endAt: item.endAt,
      durationMinutes: item.durationMinutes,
      isOpen,
      message: isOpen ? 'Tersedia' : 'Belum dibuka / sudah ditutup'
    };
  });

  return res.json({ success: true, data: items });
}

export async function getStudentTryoutResults(req: Request, res: Response) {
  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  const attempts = await prisma.tryoutAttempt.findMany({
    where: { studentId: student.id, status: 'SUBMITTED' },
    select: {
      id: true,
      submittedAt: true,
      score: true,
      tryout: {
        select: {
          title: true,
          certificateEnabled: true,
          certificateMinimumScore: true,
          certificateSignerName: true,
          certificateSignerTitle: true,
          questions: { select: { points: true } }
        }
      },
      answers: {
        select: {
          selectedAnswer: true,
          isCorrect: true,
          question: { select: { type: true } }
        }
      },
    },
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }]
  });

  return res.json({
    success: true,
    data: attempts.map((attempt) => ({
      attemptId: attempt.id,
      title: attempt.tryout.title,
      submittedAt: attempt.submittedAt,
      score: attempt.score ?? 0,
      maxScore: attempt.tryout.questions.reduce((total, question) => total + question.points, 0),
      studentName: student.user.name,
      className: student.class?.name ?? 'Belum terdaftar kelas',
      questionCount: attempt.tryout.questions.length,
      certificateEnabled: attempt.tryout.certificateEnabled,
      certificateMinimumScore: attempt.tryout.certificateMinimumScore,
      certificateSignerName: attempt.tryout.certificateSignerName ?? '',
      certificateSignerTitle: attempt.tryout.certificateSignerTitle ?? '',
      correctCount: attempt.answers.filter((answer) => answer.isCorrect === true).length,
      answeredCount: attempt.answers.filter((answer) => answer.question.type === 'MULTIPLE_CHOICE'
        ? parseMultipleChoiceAnswer(answer.selectedAnswer).length > 0
        : answer.selectedAnswer !== null).length
    }))
  });
}

export async function getStudentTryoutResultDetails(req: Request, res: Response) {
  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  const attemptId = normalizeString(req.params.attemptId);
  if (!attemptId) {
    return res.status(400).json({ success: false, message: 'ID hasil TryOut tidak valid' });
  }

  const attempt = await prisma.tryoutAttempt.findFirst({
    where: { id: attemptId, studentId: student.id, status: 'SUBMITTED' },
    select: {
      tryout: {
        select: {
          questions: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              type: true,
              text: true,
              imageUrl: true,
              options: true,
              correctAnswer: true,
              explanation: true,
              explanationImageUrl: true
            }
          }
        }
      },
      answers: {
        select: {
          questionId: true,
          selectedAnswer: true
        }
      }
    }
  });

  if (!attempt) {
    return res.status(404).json({ success: false, message: 'Hasil TryOut tidak ditemukan' });
  }

  const answersByQuestionId = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
  const questions = attempt.tryout.questions.map((question) => {
    const answer = answersByQuestionId.get(question.id);
    const options = Array.isArray(question.options)
      ? question.options.filter((option): option is string => typeof option === 'string')
      : [];

    return {
      id: question.id,
      type: question.type,
      text: question.text,
      imageUrl: question.imageUrl,
      options,
      selectedAnswer: question.type === 'MULTIPLE_CHOICE'
        ? parseMultipleChoiceAnswer(answer?.selectedAnswer ?? null)
        : answer?.selectedAnswer ?? null,
      correctAnswer: question.type === 'MULTIPLE_CHOICE'
        ? parseMultipleChoiceAnswer(question.correctAnswer)
        : question.correctAnswer,
      isCorrect: question.type === 'MULTIPLE_CHOICE'
        ? answersMatchExactly(
          parseMultipleChoiceAnswer(answer?.selectedAnswer ?? null),
          parseMultipleChoiceAnswer(question.correctAnswer)
        )
        : answer?.selectedAnswer === question.correctAnswer,
      explanation: question.explanation,
      explanationImageUrl: question.explanationImageUrl
    };
  });

  return res.json({ success: true, data: { questions } });
}

export async function startTryoutAttempt(req: Request, res: Response) {
  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  const tryoutId = normalizeString(req.params.id);
  if (!tryoutId) {
    return res.status(400).json({ success: false, message: 'ID tryout tidak valid' });
  }

  const tryout = await prisma.tryout.findUnique({
    where: { id: tryoutId },
    include: { questions: true }
  });

  if (!tryout || tryout.classId !== student.classId) {
    return res.status(404).json({ success: false, message: 'Tryout tidak tersedia untuk kelas Anda' });
  }

  const parsed = tryoutStartSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Kode akses TryOut wajib diisi' });
  }
  if (parsed.data.accessCode.toUpperCase() !== tryout.accessCode) {
    return res.status(403).json({ success: false, message: 'Kode akses TryOut salah' });
  }

  const now = new Date();
  if (now < tryout.startAt || now > tryout.endAt) {
    return res.status(403).json({ success: false, message: 'Belum dibuka / sudah ditutup' });
  }

  const existing = await prisma.tryoutAttempt.findFirst({
    where: {
      studentId: student.id,
      tryoutId,
      status: 'IN_PROGRESS'
    }
  });

  if (existing) {
    return res.json({
      success: true,
      data: {
        attemptId: existing.id,
        startedAt: existing.startedAt,
        remainingSeconds: Math.max(0, Math.floor((new Date(existing.startedAt.getTime() + tryout.durationMinutes * 60000).getTime() - now.getTime()) / 1000))
      }
    });
  }

  const attempt = await prisma.tryoutAttempt.create({
    data: {
      studentId: student.id,
      tryoutId,
      startedAt: now,
      status: 'IN_PROGRESS'
    }
  });

  if (socketState.io) {
    socketState.io.emit('tryout:attempt-started', {
      tryoutId,
      studentId: student.id,
      attemptId: attempt.id,
      startedAt: attempt.startedAt
    });
  }

  return res.status(201).json({
    success: true,
    data: {
      attemptId: attempt.id,
      startedAt: attempt.startedAt,
      remainingSeconds: tryout.durationMinutes * 60
    }
  });
}

export async function getTryoutAttempt(req: Request, res: Response) {
  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  const tryoutId = normalizeString(req.params.id);
  if (!tryoutId) {
    return res.status(400).json({ success: false, message: 'ID tryout tidak valid' });
  }

  const attempt = await prisma.tryoutAttempt.findFirst({
    where: { studentId: student.id, tryoutId },
    orderBy: { createdAt: 'desc' },
    include: { answers: true }
  });

  if (!attempt) {
    return res.status(404).json({ success: false, message: 'Belum ada attempt' });
  }

  const tryout = await prisma.tryout.findUnique({
    where: { id: tryoutId },
    include: { questions: true }
  });

  if (!tryout) {
    return res.status(404).json({ success: false, message: 'Tryout tidak ditemukan' });
  }

  return res.json({
    success: true,
    data: {
      attemptId: attempt.id,
      startedAt: attempt.startedAt,
      status: attempt.status,
      remainingSeconds: Math.max(0, Math.floor((new Date(attempt.startedAt.getTime() + tryout.durationMinutes * 60000).getTime() - new Date().getTime()) / 1000)),
      questions: tryout.questions.map((question) => ({
        id: question.id,
        type: question.type,
        text: question.text,
        imageUrl: question.imageUrl,
        options: question.options,
        selectedAnswer: question.type === 'MULTIPLE_CHOICE'
          ? parseMultipleChoiceAnswer(attempt.answers.find((answer) => answer.questionId === question.id)?.selectedAnswer ?? null)
          : attempt.answers.find((answer) => answer.questionId === question.id)?.selectedAnswer ?? null
      }))
    }
  });
}

export async function saveTryoutAnswer(req: Request, res: Response) {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Jawaban tidak valid' });
  }

  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  const tryoutId = normalizeString(req.params.id);
  if (!tryoutId) {
    return res.status(400).json({ success: false, message: 'ID tryout tidak valid' });
  }

  const attempt = await prisma.tryoutAttempt.findFirst({
    where: { tryoutId, studentId: student.id, status: 'IN_PROGRESS' }
  });

  if (!attempt) {
    return res.status(404).json({ success: false, message: 'Attempt aktif tidak ditemukan' });
  }

  const question = await prisma.question.findUnique({ where: { id: parsed.data.questionId } });
  if (!question || question.tryoutId !== tryoutId) {
    return res.status(404).json({ success: false, message: 'Soal tidak ditemukan' });
  }

  const options = Array.isArray(question.options)
    ? question.options.filter((option): option is string => typeof option === 'string')
    : [];
  let selectedAnswer: string | null = null;
  let isCorrect = false;
  if (parsed.data.selectedAnswer !== undefined) {
    if (question.type === 'MULTIPLE_CHOICE') {
      if (
        !Array.isArray(parsed.data.selectedAnswer) ||
        new Set(parsed.data.selectedAnswer).size !== parsed.data.selectedAnswer.length ||
        parsed.data.selectedAnswer.some((answer) => !options.includes(answer))
      ) {
        return res.status(400).json({ success: false, message: 'Pilih jawaban kompleks yang tersedia' });
      }
      const selectedAnswers = parsed.data.selectedAnswer;
      const correctAnswers = parseMultipleChoiceAnswer(question.correctAnswer);
      selectedAnswer = JSON.stringify(options.filter((option) => selectedAnswers.includes(option)));
      isCorrect = answersMatchExactly(selectedAnswers, correctAnswers);
    } else {
      if (Array.isArray(parsed.data.selectedAnswer) || !options.includes(parsed.data.selectedAnswer)) {
        return res.status(400).json({ success: false, message: 'Pilih salah satu jawaban yang tersedia' });
      }
      selectedAnswer = parsed.data.selectedAnswer;
      isCorrect = selectedAnswer === question.correctAnswer;
    }
  }

  const saved = await prisma.attemptAnswer.upsert({
    where: { attemptId_questionId: { attemptId: attempt.id, questionId: parsed.data.questionId } },
    update: {
      selectedAnswer,
      isCorrect
    },
    create: {
      attemptId: attempt.id,
      questionId: parsed.data.questionId,
      selectedAnswer,
      isCorrect
    }
  });

  return res.json({ success: true, data: saved });
}

export async function submitTryoutAttempt(req: Request, res: Response) {
  const student = await getStudentByUserId(req.user?.id ?? '');
  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  const tryoutId = normalizeString(req.params.id);
  if (!tryoutId) {
    return res.status(400).json({ success: false, message: 'ID tryout tidak valid' });
  }

  const attempt = await prisma.tryoutAttempt.findFirst({
    where: { tryoutId, studentId: student.id, status: 'IN_PROGRESS' },
    include: { answers: true }
  });

  if (!attempt) {
    return res.status(404).json({ success: false, message: 'Attempt aktif tidak ditemukan' });
  }

  const tryout = await prisma.tryout.findUnique({
    where: { id: tryoutId },
    include: { questions: true }
  });

  if (!tryout) {
    return res.status(404).json({ success: false, message: 'Tryout tidak ditemukan' });
  }

  let score = 0;
  for (const question of tryout.questions) {
    const answer = attempt.answers.find((a) => a.questionId === question.id);
    const isCorrect = question.type === 'MULTIPLE_CHOICE'
      ? answersMatchExactly(
        parseMultipleChoiceAnswer(answer?.selectedAnswer ?? null),
        parseMultipleChoiceAnswer(question.correctAnswer)
      )
      : answer?.selectedAnswer === question.correctAnswer;
    if (isCorrect) {
      score += question.points;
    }
  }

  const submitted = await prisma.tryoutAttempt.update({
    where: { id: attempt.id },
    data: {
      submittedAt: new Date(),
      score,
      status: 'SUBMITTED'
    }
  });

  if (socketState.io) {
    socketState.io.emit('tryout:submitted', {
      tryoutId,
      studentId: student.id,
      attemptId: attempt.id,
      score
    });
  }

  return res.json({
    success: true,
    message: 'Tryout berhasil disubmit',
    data: {
      attemptId: submitted.id,
      score,
      status: submitted.status
    }
  });
}

export async function submitFeedback(req: Request, res: Response) {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Pesan tidak valid' });
  }

  const userId = req.user?.id ?? '';
  const feedback = await prisma.feedback.create({
    data: {
      userId,
      role: 'SISWA',
      message: parsed.data.message,
      status: 'PENDING'
    }
  });

  return res.status(201).json({ success: true, message: 'Saran berhasil dikirim', data: feedback });
}

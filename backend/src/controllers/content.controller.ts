import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { readMaterialFile } from '../lib/material-file-storage.js';
import { explanationContentType, readExplanationImage } from '../lib/tryout-explanation-storage.js';

export async function getMaterialFile(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const material = await prisma.material.findUnique({ where: { id } });

  if (!material || material.type !== 'PDF' || material.fileUrl !== `/api/content/materials/${id}/file`) {
    return res.status(404).json({ success: false, message: 'File materi tidak ditemukan' });
  }

  if (req.user?.role === 'SISWA') {
    const student = await prisma.student.findUnique({
      where: { userId: req.user.id },
      select: { classId: true }
    });

    if (!student || student.classId !== material.classId) {
      return res.status(403).json({ success: false, message: 'Materi ini bukan untuk kelas Anda' });
    }

    const now = new Date();
    if (now < material.availableFrom || now > material.availableUntil) {
      return res.status(423).json({
        success: false,
        message: now < material.availableFrom ? 'Materi belum dibuka' : 'Masa akses materi sudah berakhir',
        availableFrom: material.availableFrom,
        availableUntil: material.availableUntil
      });
    }
  } else if (req.user?.role === 'GURU') {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user.id },
      select: { id: true }
    });
    const assignments = teacher
      ? await prisma.teacherSubject.findMany({
          where: { teacherId: teacher.id, subjectId: material.subjectId },
          select: { classId: true }
        })
      : [];

    if (!assignments.some((assignment) => assignment.classId === null || assignment.classId === material.classId)) {
      return res.status(403).json({ success: false, message: 'Anda tidak mengampu materi ini' });
    }
  }

  const file = await readMaterialFile(id);
  if (!file) {
    return res.status(404).json({ success: false, message: 'File materi tidak ditemukan' });
  }

  const download = req.query.download === '1';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', file.length);
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="materi-minggu-${material.weekNumber}.pdf"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.end(file);
}

export async function getTryoutExplanationImage(req: Request, res: Response) {
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i.test(filename)) {
    return res.status(404).json({ success: false, message: 'Gambar pembahasan tidak ditemukan' });
  }

  const imageUrl = `/api/content/tryout-explanations/${filename}`;
  const question = await prisma.question.findFirst({
    where: { explanationImageUrl: imageUrl },
    select: { tryoutId: true }
  });
  if (!question) {
    return res.status(404).json({ success: false, message: 'Gambar pembahasan tidak ditemukan' });
  }

  if (req.user?.role === 'SISWA') {
    const student = await prisma.student.findUnique({
      where: { userId: req.user.id },
      select: { id: true }
    });
    const completedAttempt = student
      ? await prisma.tryoutAttempt.findFirst({
        where: { studentId: student.id, tryoutId: question.tryoutId, status: 'SUBMITTED' },
        select: { id: true }
      })
      : null;
    if (!completedAttempt) {
      return res.status(403).json({ success: false, message: 'Gambar pembahasan hanya tersedia setelah TryOut dikumpulkan' });
    }
  }

  const file = await readExplanationImage(filename);
  if (!file) {
    return res.status(404).json({ success: false, message: 'File gambar pembahasan tidak ditemukan' });
  }

  res.setHeader('Content-Type', explanationContentType(filename));
  res.setHeader('Content-Length', file.length);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(file);
}
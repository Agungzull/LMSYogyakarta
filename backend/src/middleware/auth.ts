import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      username: payload.username
    };
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau expired' });
  }
}

export function requireRole(roles: Array<'ADMIN' | 'GURU' | 'SISWA'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: role tidak diizinkan' });
    }

    return next();
  };
}

export async function requireStudentAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'SISWA') {
    return res.status(403).json({ success: false, message: 'Only students can access this resource' });
  }

  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    select: { id: true }
  });

  if (!student) {
    return res.status(403).json({ success: false, message: 'Akun siswa tidak terdaftar' });
  }

  req.user = {
    ...req.user,
    id: student.id
  };

  return next();
}

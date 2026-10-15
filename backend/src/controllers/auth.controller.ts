import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { buildPasswordValidationError, comparePassword, generateRandomToken, hashPassword } from '../lib/password.js';
import { env } from '../config/env.js';

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(4)
});

const forgotStudentSchema = z.object({
  nis: z.string().min(3),
  birthDate: z.string().min(8)
});

const forgotEmailSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(16),
  newPassword: z.string().min(8)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(4),
  newPassword: z.string().min(8)
});

function sanitizeUser(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function isPasswordStrong(password: string) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
}

export async function login(req: Request, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: parsed.data.username },
          { email: parsed.data.username }
        ]
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    const isValidPassword = await comparePassword(parsed.data.password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
      username: user.username
    });

    const refreshToken = signRefreshToken({
      sub: user.id,
      role: user.role,
      email: user.email,
      username: user.username
    });

    res.cookie('lms_access_token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 15 * 60 * 1000
    });

    res.cookie('lms_refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        user: sanitizeUser(user),
        accessToken,
        refreshToken,
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Login gagal' });
  }
}

export async function logout(_req: Request, res: Response) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: false,
    path: '/'
  };
  res.clearCookie('lms_access_token', cookieOptions);
  res.clearCookie('lms_refresh_token', cookieOptions);
  return res.json({ success: true, message: 'Logout berhasil' });
}

export async function refreshToken(req: Request, res: Response) {
  const { refreshToken: token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Refresh token wajib ada' });
  }

  try {
    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Session tidak valid' });
    }

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
      username: user.username
    });

    return res.json({
      success: true,
      message: 'Token berhasil diperbarui',
      data: { accessToken }
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Refresh token tidak valid' });
  }
}

export async function getMe(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id }
  });

  if (!user) {
    return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  }

  return res.json({ success: true, data: sanitizeUser(user) });
}

export async function forgotPasswordStudent(req: Request, res: Response) {
  const parsed = forgotStudentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'NIS dan tanggal lahir wajib diisi' });
  }

  const normalizedBirth = new Date(parsed.data.birthDate);
  const student = await prisma.student.findFirst({
    where: { nis: parsed.data.nis },
    include: { user: true }
  });

  const matches = Boolean(
    student &&
      student.birthDate &&
      normalizedBirth.getTime() === new Date(student.birthDate).getTime()
  );

  if (matches && student) {
    const existingRequest = await prisma.passwordResetRequest.findFirst({
      where: { studentId: student.id, status: 'PENDING' }
    });

    if (existingRequest) {
      await prisma.passwordResetRequest.update({
        where: { id: existingRequest.id },
        data: { createdAt: new Date() }
      });
    } else {
      await prisma.passwordResetRequest.create({
        data: { studentId: student.id, status: 'PENDING' }
      });
    }

    const adminUsers = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    await prisma.notification.createMany({
      data: adminUsers.map((user: { id: string }) => ({
        userId: user.id,
        title: 'Permintaan reset password',
        body: `Siswa ${student.nis} mengajukan permintaan reset password.`,
        isRead: false
      }))
    });
  }

  return res.json({
    success: true,
    message: 'Jika data cocok, permintaan reset akan diproses oleh admin.'
  });
}

export async function forgotPasswordEmail(req: Request, res: Response) {
  const parsed = forgotEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Email tidak valid' });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || (user.role !== 'ADMIN' && user.role !== 'GURU')) {
    return res.json({
      success: true,
      message: 'Jika email terdaftar, instruksi reset telah dikirim.'
    });
  }

  const rawToken = generateRandomToken();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + (user.role === 'ADMIN' ? 15 * 60 * 1000 : 30 * 60 * 1000));

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      requestIp: req.ip ?? 'unknown'
    }
  });

  const resetLink = `${env.frontendUrl}/reset-password?token=${rawToken}`;
  console.log(`[DEV EMAIL] Reset password untuk ${user.email}: ${resetLink}`);

  return res.json({
    success: true,
    message: 'Jika email terdaftar, instruksi reset telah dikirim.'
  });
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Token dan password baru wajib diisi' });
  }

  if (!isPasswordStrong(parsed.data.newPassword)) {
    return res.status(400).json({ success: false, message: buildPasswordValidationError() });
  }

  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
  const tokenRecord = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });

  if (!tokenRecord) {
    return res.status(400).json({ success: false, message: 'Token tidak valid atau sudah kedaluwarsa' });
  }

  const currentUser = tokenRecord.user;
  const isSamePassword = await comparePassword(parsed.data.newPassword, currentUser.passwordHash);
  if (isSamePassword) {
    return res.status(400).json({ success: false, message: 'Password baru tidak boleh sama dengan password lama' });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: currentUser.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false
      }
    }),
    prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() }
    }),
    prisma.auditLog.create({
      data: {
        actorId: currentUser.id,
        action: 'PASSWORD_RESET_SUCCESS',
        targetUserId: currentUser.id,
        ip: req.ip ?? 'unknown'
      }
    })
  ]);

  return res.json({
    success: true,
    message: 'Password berhasil diubah. Silakan login kembali.'
  });
}

export async function changePassword(req: Request, res: Response) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Password lama dan baru wajib diisi' });
  }

  if (!isPasswordStrong(parsed.data.newPassword)) {
    return res.status(400).json({ success: false, message: buildPasswordValidationError() });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user?.id ?? '' } });
  if (!user) {
    return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  }

  const isOldValid = await comparePassword(parsed.data.currentPassword, user.passwordHash);
  if (!isOldValid) {
    return res.status(400).json({ success: false, message: 'Password lama tidak sesuai' });
  }

  const same = await comparePassword(parsed.data.newPassword, user.passwordHash);
  if (same) {
    return res.status(400).json({ success: false, message: 'Password baru tidak boleh sama dengan password lama' });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      mustChangePassword: false
    }
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'CHANGE_PASSWORD',
      targetUserId: user.id,
      ip: req.ip ?? 'unknown'
    }
  });

  return res.json({ success: true, message: 'Password berhasil diperbarui' });
}

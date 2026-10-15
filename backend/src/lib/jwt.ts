import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type TokenPayload = {
  sub: string;
  role: 'ADMIN' | 'GURU' | 'SISWA';
  email?: string | null;
  username?: string | null;
};

export function signAccessToken(payload: TokenPayload) {
  return jwt.sign(payload, env.jwtAccessSecret as any, {
    expiresIn: env.jwtAccessExpiresIn as any
  } as any);
}

export function signRefreshToken(payload: TokenPayload) {
  return jwt.sign(payload, env.jwtRefreshSecret as any, {
    expiresIn: env.jwtRefreshExpiresIn as any
  } as any);
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.jwtAccessSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.jwtRefreshSecret) as TokenPayload;
}

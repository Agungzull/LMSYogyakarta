import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, env.bcryptRounds);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function generateRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function buildPasswordValidationError() {
  return 'Password minimal 8 karakter, kombinasi huruf & angka';
}

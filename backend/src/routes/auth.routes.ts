import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  changePassword,
  forgotPasswordEmail,
  forgotPasswordStudent,
  getMe,
  login,
  logout,
  refreshToken,
  resetPassword
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const genericPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak permintaan. Coba lagi nanti.' }
});

router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh', refreshToken);
router.get('/me', requireAuth, getMe);
router.post('/forgot-password/student', genericPasswordLimiter, forgotPasswordStudent);
router.post('/forgot-password/email', genericPasswordLimiter, forgotPasswordEmail);
router.post('/reset-password', genericPasswordLimiter, resetPassword);
router.post('/change-password', requireAuth, changePassword);

export default router;

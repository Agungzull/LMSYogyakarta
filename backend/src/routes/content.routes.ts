import { Router } from 'express';
import { getMaterialFile, getTryoutExplanationImage } from '../controllers/content.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireRole(['ADMIN', 'GURU', 'SISWA']));
router.get('/materials/:id/file', getMaterialFile);
router.get('/tryout-explanations/:filename', requireRole(['ADMIN', 'SISWA']), getTryoutExplanationImage);

export default router;
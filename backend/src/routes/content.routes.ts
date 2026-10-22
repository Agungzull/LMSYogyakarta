import { Router } from 'express';
import { getMaterialFile, getTryoutExplanationImage, getTryoutQuestionImage } from '../controllers/content.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Tryout images are served with UUID filenames and CORS/CORP headers for <img> tags
router.get('/tryout-questions/:filename', getTryoutQuestionImage);
router.get('/tryout-explanations/:filename', getTryoutExplanationImage);

// Protected resources like PDF materials
router.use(requireAuth, requireRole(['ADMIN', 'GURU', 'SISWA']));
router.get('/materials/:id/file', getMaterialFile);

export default router;
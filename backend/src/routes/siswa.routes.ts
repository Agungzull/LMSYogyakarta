import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getAvailableMaterials,
  getAvailableVideos,
  getStudentDashboard,
  getStudentSchedules,
  getStudentTryouts,
  getStudentTryoutResultDetails,
  getStudentTryoutResults,
  getTryoutAttempt,
  saveTryoutAnswer,
  startTryoutAttempt,
  submitFeedback,
  submitTryoutAttempt
} from '../controllers/siswa.controller.js';

const router = Router();

router.use(requireAuth, requireRole(['SISWA']));

router.get('/dashboard', getStudentDashboard);
router.get('/schedules', getStudentSchedules);
router.get('/materials', getAvailableMaterials);
router.get('/videos', getAvailableVideos);
router.get('/tryouts', getStudentTryouts);
router.get('/tryouts/results', getStudentTryoutResults);
router.get('/tryouts/results/:attemptId', getStudentTryoutResultDetails);
router.post('/tryouts/:id/start', startTryoutAttempt);
router.get('/tryouts/:id/attempt', getTryoutAttempt);
router.post('/tryouts/:id/answers', saveTryoutAnswer);
router.post('/tryouts/:id/submit', submitTryoutAttempt);
router.post('/feedback', submitFeedback);

export default router;

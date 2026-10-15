import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  createDailyScore,
  createFeedback,
  getAttendance,
  getDailyScores,
  getMaterialsForTeacher,
  getMySchedules,
  getTeacherResetRequests,
  processTeacherResetRequest,
  submitAttendance
} from '../controllers/guru.controller.js';

const router = Router();

router.use(requireAuth, requireRole(['GURU']));

router.get('/schedules', getMySchedules);
router.get('/attendance', getAttendance);
router.post('/attendance', submitAttendance);
router.get('/daily-scores', getDailyScores);
router.post('/daily-scores', createDailyScore);
router.get('/materials', getMaterialsForTeacher);
router.get('/reset-requests', getTeacherResetRequests);
router.patch('/reset-requests/:id', processTeacherResetRequest);
router.post('/feedback', createFeedback);

export default router;

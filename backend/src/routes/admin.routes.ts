import multer from 'multer';
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  approveResetRequest,
  createClass,
  createMaterial,
  createSchedule,
  createStudent,
  createSubject,
  createTeacher,
  deleteMaterial,
  deleteStudent,
  deleteTeacher,
  getClasses,
  getMaterials,
  getResetRequests,
  getSchedules,
  getStudents,
  getSubjects,
  getTeachers,
  getTryoutMonitoring,
  getTryouts,
  getStudentReports,
  exportClassReport,
  importStudents,
  importTeachers,
  createTryout,
  resetUserPassword,
  updateClass,
  updateMaterial,
  updateSubject,
  updateStudent,
  updateTeacher,
  updateTryoutCertificateSettings,
  exportNewAccountCredentials
} from '../controllers/admin.controller.js';

const router = Router();

// Vercel membatasi body request serverless di 4.5MB, jadi default unggahan 4MB
// dan bisa diturunkan lewat UPLOAD_MAX_FILE_SIZE.
const maxUploadBytes = Number(process.env.UPLOAD_MAX_FILE_SIZE ?? 4 * 1024 * 1024);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadBytes
  }
});
const materialUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes }
});
const tryoutUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes, files: 20 }
});

router.use(requireAuth, requireRole(['ADMIN']));

router.get('/classes', getClasses);
router.post('/classes', createClass);
router.patch('/classes/:id', updateClass);

router.get('/subjects', getSubjects);
router.post('/subjects', createSubject);
router.patch('/subjects/:id', updateSubject);

router.get('/schedules', getSchedules);
router.post('/schedules', createSchedule);

router.get('/students', getStudents);
router.get('/reports/students', getStudentReports);
router.get('/reports/classes/export', exportClassReport);
router.post('/students', createStudent);
router.post('/students/import', upload.single('file'), importStudents);
router.patch('/students/:id', updateStudent);
router.delete('/students/:id', deleteStudent);

router.get('/teachers', getTeachers);
router.post('/teachers', createTeacher);
router.post('/teachers/import', upload.single('file'), importTeachers);
router.patch('/teachers/:id', updateTeacher);
router.delete('/teachers/:id', deleteTeacher);

router.get('/materials', getMaterials);
router.post('/materials', materialUpload.single('file'), createMaterial);
router.patch('/materials/:id', updateMaterial);
router.delete('/materials/:id', deleteMaterial);

router.get('/reset-requests', getResetRequests);
router.patch('/reset-requests/:id', approveResetRequest);
router.post('/users/:id/reset-password', resetUserPassword);
router.post('/users/credentials/export', exportNewAccountCredentials);

router.get('/tryouts', getTryouts);
router.post('/tryouts', tryoutUpload.array('explanationImages', 20), createTryout);
router.patch('/tryouts/:id/certificate', updateTryoutCertificateSettings);
router.get('/tryouts/:id/monitoring', getTryoutMonitoring);

export default router;

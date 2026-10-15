import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const Role = {
  ADMIN: 'ADMIN',
  GURU: 'GURU',
  SISWA: 'SISWA'
} as const;

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('Admin123!', 10);
  const teacherPassword = await bcrypt.hash('Guru123!', 10);
  const studentPassword = await bcrypt.hash('Siswa123!', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      name: 'Administrator LMS',
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: adminPassword,
      role: Role.ADMIN,
      mustChangePassword: false,
      isActive: true
    }
  });

  const teacher1 = await prisma.user.upsert({
    where: { username: 'guru1' },
    update: {
      passwordHash: teacherPassword,
      role: Role.GURU,
      mustChangePassword: false,
      isActive: true
    },
    create: {
      name: 'Rina Sari',
      username: 'guru1',
      email: 'guru1@example.com',
      passwordHash: teacherPassword,
      role: Role.GURU,
      mustChangePassword: false,
      isActive: true
    }
  });

  const teacher2 = await prisma.user.upsert({
    where: { username: 'guru2' },
    update: {
      passwordHash: teacherPassword,
      role: Role.GURU,
      mustChangePassword: false,
      isActive: true
    },
    create: {
      name: 'Budi Hartono',
      username: 'guru2',
      email: 'guru2@example.com',
      passwordHash: teacherPassword,
      role: Role.GURU,
      mustChangePassword: false,
      isActive: true
    }
  });

  const teacherRecord1 = await prisma.teacher.upsert({
    where: { userId: teacher1.id },
    update: {},
    create: { userId: teacher1.id, nip: 'NIP-1001' }
  });

  const teacherRecord2 = await prisma.teacher.upsert({
    where: { userId: teacher2.id },
    update: {},
    create: { userId: teacher2.id, nip: 'NIP-1002' }
  });

  const classRoom = await prisma.class.upsert({
    where: { id: 'class-10a' },
    update: {},
    create: {
      id: 'class-10a',
      name: 'Kelas 10 A',
      level: '10'
    }
  });

  const maths = await prisma.subject.upsert({
    where: { code: 'MATH' },
    update: {},
    create: {
      name: 'Matematika',
      code: 'MATH'
    }
  });

  const english = await prisma.subject.upsert({
    where: { code: 'ENG' },
    update: {},
    create: {
      name: 'Bahasa Inggris',
      code: 'ENG'
    }
  });

  await prisma.teacherSubject.upsert({
    where: {
      teacherId_subjectId_classId: {
        teacherId: teacherRecord1.id,
        subjectId: maths.id,
        classId: classRoom.id
      }
    },
    update: {},
    create: {
      teacherId: teacherRecord1.id,
      subjectId: maths.id,
      classId: classRoom.id
    }
  });

  await prisma.teacherSubject.upsert({
    where: {
      teacherId_subjectId_classId: {
        teacherId: teacherRecord2.id,
        subjectId: english.id,
        classId: classRoom.id
      }
    },
    update: {},
    create: {
      teacherId: teacherRecord2.id,
      subjectId: english.id,
      classId: classRoom.id
    }
  });

  const studentUsers = [
    { name: 'Ayu Wulandari', username: 'siswa1', email: 'siswa1@example.com', nis: 'S001', birth: '2009-04-12T00:00:00.000Z' },
    { name: 'Bima Pratama', username: 'siswa2', email: 'siswa2@example.com', nis: 'S002', birth: '2009-06-17T00:00:00.000Z' },
    { name: 'Citra Lestari', username: 'siswa3', email: 'siswa3@example.com', nis: 'S003', birth: '2009-03-10T00:00:00.000Z' },
    { name: 'Dimas Nugroho', username: 'siswa4', email: 'siswa4@example.com', nis: 'S004', birth: '2009-10-22T00:00:00.000Z' },
    { name: 'Eka Putri', username: 'siswa5', email: 'siswa5@example.com', nis: 'S005', birth: '2009-01-29T00:00:00.000Z' }
  ];

  const createdStudents = [] as Array<{ id: string; nis: string; userId: string }>;

  for (const item of studentUsers) {
    const user = await prisma.user.upsert({
      where: { username: item.username },
      update: {
        passwordHash: studentPassword,
        role: Role.SISWA,
        mustChangePassword: false,
        isActive: true
      },
      create: {
        name: item.name,
        username: item.username,
        email: item.email,
        passwordHash: studentPassword,
        role: Role.SISWA,
        isActive: true,
        mustChangePassword: false
      }
    });

    const student = await prisma.student.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        nis: item.nis,
        classId: classRoom.id,
        birthDate: new Date(item.birth)
      }
    });

    createdStudents.push({ id: student.id, nis: student.nis, userId: user.id });
  }

  const mondaySchedule = await prisma.schedule.upsert({
    where: {
      id: 'schedule-1'
    },
    update: {},
    create: {
      id: 'schedule-1',
      classId: classRoom.id,
      subjectId: maths.id,
      teacherId: teacherRecord1.id,
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '09:30'
    }
  });

  const material = await prisma.material.create({
    data: {
      title: 'Materi Fungsi Kuadrat',
      type: 'PDF',
      fileUrl: 'https://example.com/materi-fungsi-kuadrat.pdf',
      subjectId: maths.id,
      classId: classRoom.id,
      availableFrom: new Date(Date.now() - 86400000),
      availableUntil: new Date(Date.now() + 86400000 * 7),
      uploadedById: admin.id
    }
  });

  await prisma.notification.createMany({
    data: [
      { userId: admin.id, title: 'Sistem siap', body: 'Platform LMS sudah aktif untuk kelas 10A.', isRead: false },
      { userId: teacher1.id, title: 'Jadwal diterima', body: 'Jadwal mengajar untuk kelas 10A sudah dibuat.', isRead: false }
    ]
  });

  const tryout = await prisma.tryout.create({
    data: {
      title: 'Tryout Matematika Dasar',
      accessCode: crypto.randomBytes(6).toString('hex').toUpperCase(),
      durationMinutes: 45,
      startAt: new Date(Date.now() - 3600000),
      endAt: new Date(Date.now() + 86400000 * 2),
      classId: classRoom.id,
      shuffleQuestions: true,
      questions: {
        create: [
          { text: 'Hasil dari 12 + 8 × 3 adalah?', options: ['36', '24', '28', '32'], correctAnswer: '36', points: 10, explanation: 'Operasi perkalian didahulukan.' },
          { text: 'Bilangan prima antara 10 dan 20 adalah?', options: ['11, 13, 17, 19', '11, 15, 17', '12, 13, 19', '13, 15, 17'], correctAnswer: '11, 13, 17, 19', points: 10, explanation: 'Bilangan prima adalah yang tidak habis dibagi selain 1 dan dirinya sendiri.' },
          { text: 'Nilai x dari 2x + 5 = 17 adalah?', options: ['6', '5', '7', '4'], correctAnswer: '6', points: 10, explanation: '2x = 12, lalu x = 6.' },
          { text: 'Luas persegi dengan sisi 9 cm adalah?', options: ['18 cm²', '81 cm²', '72 cm²', '36 cm²'], correctAnswer: '81 cm²', points: 10, explanation: 'Luas persegi = sisi × sisi.' },
          { text: 'KPK dari 12 dan 18 adalah?', options: ['36', '24', '18', '12'], correctAnswer: '36', points: 10, explanation: 'KPK dari 12 dan 18 adalah 36.' },
          { text: 'Bentuk sederhana dari 3/4 + 1/8 adalah?', options: ['7/8', '4/8', '5/8', '1/2'], correctAnswer: '7/8', points: 10, explanation: '3/4 = 6/8, ditambah 1/8 = 7/8.' },
          { text: '5² + 3² = ?', options: ['34', '16', '26', '30'], correctAnswer: '34', points: 10, explanation: '25 + 9 = 34.' },
          { text: 'Akar kuadrat dari 144 adalah?', options: ['10', '11', '12', '13'], correctAnswer: '12', points: 10, explanation: '12 × 12 = 144.' },
          { text: 'Persamaan garis lurus y = 2x + 1 jika x = 3 maka y = ?', options: ['5', '6', '7', '8'], correctAnswer: '7', points: 10, explanation: 'y = 2(3) + 1 = 7.' },
          { text: 'Sebuah kubus memiliki sisi 4 cm, volume adalah?', options: ['16 cm³', '32 cm³', '48 cm³', '64 cm³'], correctAnswer: '64 cm³', points: 10, explanation: 'Volume kubus = sisi³ = 4³ = 64.' }
        ]
      }
    }
  });

  await prisma.feedback.create({
    data: {
      userId: studentUsers[0].username ? admin.id : admin.id,
      role: Role.ADMIN,
      message: 'Sistem menunggu validasi kebutuhan kelas.',
      status: 'PENDING'
    }
  });

  console.log('Seed data ready');
  console.log({ admin: admin.username, teacher1: teacher1.username, teacher2: teacher2.username, students: createdStudents.length, tryout: tryout.title, material: material.title, schedule: mondaySchedule.id });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

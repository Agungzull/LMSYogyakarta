# LMS Fullstack System

Repositori ini memuat fondasi fase 1 untuk sistem LMS berbasis sekolah: setup monorepo, database, branding default, landing page publik, autentikasi berbasis role, serta flow ganti password.

## Struktur monorepo

- frontend: Next.js App Router + TypeScript + Tailwind CSS
- backend: Node.js + Express + TypeScript + Prisma + JWT
- docker-compose: PostgreSQL untuk development

## Quick start

1. Salin file `.env.example` menjadi `.env` dan sesuaikan variabel yang diperlukan.
2. Instal dependensi:
   ```bash
   npm install
   ```
3. Jalankan PostgreSQL via Docker:
   ```bash
   docker compose up -d postgres
   ```
4. Generate Prisma client, migrasi, dan seed data awal:
   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```
5. Jalankan aplikasi:
   ```bash
   npm run dev
   ```

## Akun seed default

- Admin: username `admin`, email `admin@example.com`, password `Admin123!`
- Guru: username `guru1`, email `guru1@example.com`, password `Guru123!`
- Siswa: username `siswa1`, email `siswa1@example.com`, password `Siswa123!`

Menjalankan ulang `npm run db:seed` akan mengatur ulang password akun contoh guru (`guru1`, `guru2`) menjadi `Guru123!` dan siswa (`siswa1`–`siswa5`) menjadi `Siswa123!`. Akun yang dibuat admin di luar daftar tersebut tetap menggunakan password masing-masing.

## Mengganti logo dan judul sistem secara manual

Branding default ditempatkan di satu file konfigurasi frontend agar mudah diubah tanpa menyentuh banyak komponen:

- [frontend/src/config/site.ts](frontend/src/config/site.ts)
- [frontend/public/logo.svg](frontend/public/logo.svg)
- [frontend/public/favicon.svg](frontend/public/favicon.svg)

Jika ingin mengganti nama sistem, tagline, judul hero, atau logo:

1. Ubah nilai di [frontend/src/config/site.ts](frontend/src/config/site.ts), misalnya `siteName`, `tagline`, `heroTitle`, `heroSubtitle`, dan `logo`.
2. Ganti file logo di [frontend/public/logo.svg](frontend/public/logo.svg) dengan desain baru Anda.
3. Jika ingin favicon baru, ganti [frontend/public/favicon.svg](frontend/public/favicon.svg).
4. Pastikan path logo tetap sesuai dengan nilai `logo` di file konfigurasi.

## Fase yang sudah aktif

- Fase 1 selesai: setup monorepo, konfigurasi database, branding dasar, landing page publik, auth + RBAC, serta flow ganti password.
- Fase 2 dan seterusnya belum dimulai sampai konfirmasi lanjut.

## Catatan implementasi

- Waktu validasi akses konten tetap memakai server-side logic, bukan jam perangkat pengguna.
- Password reset token disimpan dalam bentuk hash dan token yang sudah dipakai otomatis tidak lagi valid.
- Backend memiliki endpoint publik `/api/public/site` untuk menyediakan data branding dasar.
- Setiap TryOut memiliki kode akses yang dibuat otomatis saat admin menyimpan TryOut. Bagikan kode dari dashboard admin kepada siswa; siswa wajib memasukkannya sebelum memulai atau melanjutkan pengerjaan. Terapkan perubahan skema melalui migrasi Prisma sebelum menjalankan aplikasi.
- Admin dapat mengaktifkan sertifikat per TryOut, menentukan nilai minimum dalam persen, serta mengatur nama dan jabatan penandatangan. Siswa yang memenuhi syarat dapat mencetak atau menyimpan sertifikat sebagai PDF melalui browser.
- Username dan password sementara akun baru dapat diunduh Admin dalam file Excel setelah akun dibuat atau import selesai. Kredensial hanya tersedia sementara pada sesi dashboard; password akun lama tidak dapat dipulihkan dari hash.

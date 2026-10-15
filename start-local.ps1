Set-Location $PSScriptRoot

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
}

Write-Host "==> Membuka PostgreSQL via Docker..."
docker compose up -d postgres
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker tidak tersedia / Docker Desktop belum aktif. Jalankan Docker Desktop dulu lalu ulangi." 
    exit $LASTEXITCODE
}

Write-Host "==> Install dependency..."
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Generate Prisma client..."
npm run db:generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Migrasi database..."
npm run db:migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Seed data awal..."
npm run db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Menjalankan backend + frontend..."
npm run dev

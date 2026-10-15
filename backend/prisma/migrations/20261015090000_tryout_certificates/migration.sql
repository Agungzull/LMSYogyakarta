ALTER TABLE "Tryout"
ADD COLUMN "certificateEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "certificateMinimumScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "certificateSignerName" TEXT,
ADD COLUMN "certificateSignerTitle" TEXT;

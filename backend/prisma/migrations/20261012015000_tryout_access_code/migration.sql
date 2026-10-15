ALTER TABLE "Tryout" ADD COLUMN "accessCode" TEXT;

WITH numbered_tryouts AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS sequence
  FROM "Tryout"
)
UPDATE "Tryout"
SET "accessCode" = 'LEGACY-' || LPAD(numbered_tryouts.sequence::text, 8, '0')
FROM numbered_tryouts
WHERE "Tryout"."id" = numbered_tryouts."id";

ALTER TABLE "Tryout" ALTER COLUMN "accessCode" SET NOT NULL;
CREATE UNIQUE INDEX "Tryout_accessCode_key" ON "Tryout"("accessCode");

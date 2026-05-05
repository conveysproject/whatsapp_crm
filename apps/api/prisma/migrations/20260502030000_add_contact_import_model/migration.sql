-- CreateEnum
CREATE TYPE "ContactImportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "contact_imports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "ContactImportStatus" NOT NULL DEFAULT 'pending',
    "total_rows" INTEGER NOT NULL,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "field_mapping" JSONB NOT NULL,
    "batch_tags" TEXT[],
    "lifecycle_stage" "LifecycleStage" NOT NULL,
    "update_existing" BOOLEAN NOT NULL DEFAULT false,
    "error_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "contact_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_imports_organization_id_idx" ON "contact_imports"("organization_id");

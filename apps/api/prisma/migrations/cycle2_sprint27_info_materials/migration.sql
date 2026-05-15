-- CreateTable: info_materials
CREATE TABLE "info_materials" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "file_url" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "info_materials_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "info_materials_organization_id_idx" ON "info_materials"("organization_id");
CREATE INDEX "info_materials_organization_id_type_idx" ON "info_materials"("organization_id", "type");

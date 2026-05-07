-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'success', 'failed', 'retrying');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size_bytes" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT,
    "type" TEXT NOT NULL DEFAULT 'custom',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "show_in_menu" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery_logs" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "webhook_log_id" TEXT,
    "message_id" TEXT,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "response_code" INTEGER,
    "response_body" TEXT,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "attempted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_organization_id_idx" ON "media_assets"("organization_id");

-- CreateIndex
CREATE INDEX "media_assets_organization_id_type_idx" ON "media_assets"("organization_id", "type");

-- CreateIndex
CREATE INDEX "pages_organization_id_idx" ON "pages"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "pages_organization_id_slug_key" ON "pages"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "webhook_logs_organization_id_idx" ON "webhook_logs"("organization_id");

-- CreateIndex
CREATE INDEX "webhook_logs_organization_id_source_idx" ON "webhook_logs"("organization_id", "source");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_webhook_id_idx" ON "webhook_delivery_logs"("webhook_id");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_webhook_log_id_idx" ON "webhook_delivery_logs"("webhook_log_id");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_status_idx" ON "webhook_delivery_logs"("status");

-- AddForeignKey
ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_webhook_log_id_fkey" FOREIGN KEY ("webhook_log_id") REFERENCES "webhook_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

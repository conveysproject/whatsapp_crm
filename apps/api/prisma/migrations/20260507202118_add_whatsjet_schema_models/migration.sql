-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'pending', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('initiated', 'ringing', 'answered', 'completed', 'missed', 'failed');

-- CreateTable
CREATE TABLE "labels" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text_color" TEXT,
    "bg_color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_labels" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_labels" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_custom_fields" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "input_name" TEXT NOT NULL,
    "input_type" TEXT NOT NULL DEFAULT 'text',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_custom_field_values" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "field_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_contacts" (
    "id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segment_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_segments" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,

    CONSTRAINT "campaign_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "subject" TEXT,
    "description" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "priority" "TicketPriority" NOT NULL DEFAULT 'medium',
    "assigned_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_calls" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'initiated',
    "call_direction" "CallDirection" NOT NULL,
    "wac_id" TEXT,
    "wab_phone_number_id" TEXT,
    "contact_wa_id" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "initiated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "action" TEXT,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "activity" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_token" TEXT,
    "device_id" TEXT,
    "device_type" TEXT,
    "fcm_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "labels_organization_id_idx" ON "labels"("organization_id");

-- CreateIndex
CREATE INDEX "contact_labels_contact_id_idx" ON "contact_labels"("contact_id");

-- CreateIndex
CREATE INDEX "contact_labels_label_id_idx" ON "contact_labels"("label_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_labels_contact_id_label_id_key" ON "contact_labels"("contact_id", "label_id");

-- CreateIndex
CREATE INDEX "message_labels_message_id_idx" ON "message_labels"("message_id");

-- CreateIndex
CREATE INDEX "message_labels_label_id_idx" ON "message_labels"("label_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_labels_message_id_label_id_key" ON "message_labels"("message_id", "label_id");

-- CreateIndex
CREATE INDEX "contact_custom_fields_organization_id_idx" ON "contact_custom_fields"("organization_id");

-- CreateIndex
CREATE INDEX "contact_custom_field_values_contact_id_idx" ON "contact_custom_field_values"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_custom_field_values_contact_id_field_id_key" ON "contact_custom_field_values"("contact_id", "field_id");

-- CreateIndex
CREATE INDEX "segment_contacts_segment_id_idx" ON "segment_contacts"("segment_id");

-- CreateIndex
CREATE INDEX "segment_contacts_contact_id_idx" ON "segment_contacts"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "segment_contacts_segment_id_contact_id_key" ON "segment_contacts"("segment_id", "contact_id");

-- CreateIndex
CREATE INDEX "campaign_segments_campaign_id_idx" ON "campaign_segments"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_segments_segment_id_idx" ON "campaign_segments"("segment_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_segments_campaign_id_segment_id_key" ON "campaign_segments"("campaign_id", "segment_id");

-- CreateIndex
CREATE INDEX "tickets_organization_id_idx" ON "tickets"("organization_id");

-- CreateIndex
CREATE INDEX "tickets_organization_id_status_idx" ON "tickets"("organization_id", "status");

-- CreateIndex
CREATE INDEX "tickets_contact_id_idx" ON "tickets"("contact_id");

-- CreateIndex
CREATE INDEX "whatsapp_calls_organization_id_idx" ON "whatsapp_calls"("organization_id");

-- CreateIndex
CREATE INDEX "whatsapp_calls_contact_id_idx" ON "whatsapp_calls"("contact_id");

-- CreateIndex
CREATE INDEX "notifications_organization_id_idx" ON "notifications"("organization_id");

-- CreateIndex
CREATE INDEX "notifications_organization_id_user_id_idx" ON "notifications"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_idx" ON "activity_logs"("organization_id");

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_user_id_idx" ON "activity_logs"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "user_devices_user_id_idx" ON "user_devices"("user_id");

-- AddForeignKey
ALTER TABLE "contact_labels" ADD CONSTRAINT "contact_labels_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_labels" ADD CONSTRAINT "contact_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_custom_field_values" ADD CONSTRAINT "contact_custom_field_values_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_custom_field_values" ADD CONSTRAINT "contact_custom_field_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "contact_custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_contacts" ADD CONSTRAINT "segment_contacts_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_contacts" ADD CONSTRAINT "segment_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_segments" ADD CONSTRAINT "campaign_segments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_segments" ADD CONSTRAINT "campaign_segments_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_calls" ADD CONSTRAINT "whatsapp_calls_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

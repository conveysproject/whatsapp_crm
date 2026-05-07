-- AlterTable
ALTER TABLE "auto_replies" ADD COLUMN     "parent_id" TEXT;

-- AlterTable
ALTER TABLE "bot_sessions" ADD COLUMN     "session_data" JSONB,
ADD COLUMN     "timeout_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "chatbots" ADD COLUMN     "is_strict_flow" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "session_timeout_minutes" INTEGER;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "disable_bot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "language_code" TEXT,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "wa_blocked_at" TIMESTAMP(3),
ADD COLUMN     "whatsapp_opt_out" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "sla_id" TEXT,
ADD COLUMN     "team_id" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "is_system_message" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reply_to_id" TEXT,
ADD COLUMN     "wab_phone_number_id" TEXT;

-- CreateIndex
CREATE INDEX "bot_sessions_timeout_at_idx" ON "bot_sessions"("timeout_at");

-- CreateIndex
CREATE INDEX "campaigns_organization_id_status_idx" ON "campaigns"("organization_id", "status");

-- CreateIndex
CREATE INDEX "campaigns_organization_id_status_scheduled_at_idx" ON "campaigns"("organization_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "contacts_organization_id_whatsapp_opt_out_idx" ON "contacts"("organization_id", "whatsapp_opt_out");

-- CreateIndex
CREATE INDEX "contacts_organization_id_deleted_at_idx" ON "contacts"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "conversations_organization_id_assigned_to_idx" ON "conversations"("organization_id", "assigned_to");

-- CreateIndex
CREATE INDEX "conversations_organization_id_team_id_idx" ON "conversations"("organization_id", "team_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_sent_at_idx" ON "messages"("conversation_id", "sent_at");

-- CreateIndex
CREATE INDEX "messages_organization_id_direction_status_idx" ON "messages"("organization_id", "direction", "status");

-- CreateIndex
CREATE INDEX "messages_organization_id_is_system_message_idx" ON "messages"("organization_id", "is_system_message");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_sla_id_fkey" FOREIGN KEY ("sla_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_replies" ADD CONSTRAINT "auto_replies_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "auto_replies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

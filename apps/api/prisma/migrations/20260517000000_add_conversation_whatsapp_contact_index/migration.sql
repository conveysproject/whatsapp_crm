CREATE INDEX IF NOT EXISTS "conversations_organization_id_whatsapp_contact_id_idx"
ON "conversations"("organization_id", "whatsapp_contact_id");

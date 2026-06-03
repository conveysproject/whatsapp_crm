CREATE TABLE "inbound_message_dumps" (
    "id" TEXT NOT NULL,
    "wamid" TEXT NOT NULL,
    "from_phone" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "body" TEXT,
    "raw_message" JSONB NOT NULL,
    "org_id" TEXT,
    "queued" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inbound_message_dumps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inbound_message_dumps_wamid_idx" ON "inbound_message_dumps"("wamid");
CREATE INDEX "inbound_message_dumps_from_phone_idx" ON "inbound_message_dumps"("from_phone");
CREATE INDEX "inbound_message_dumps_created_at_idx" ON "inbound_message_dumps"("created_at");


-- CreateTable
CREATE TABLE "contact_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_events_organization_id_contact_id_idx" ON "contact_events"("organization_id", "contact_id");

-- CreateIndex
CREATE INDEX "contact_events_organization_id_name_idx" ON "contact_events"("organization_id", "name");

-- CreateIndex
CREATE INDEX "contact_events_contact_id_name_idx" ON "contact_events"("contact_id", "name");

-- AddForeignKey
ALTER TABLE "contact_events" ADD CONSTRAINT "contact_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

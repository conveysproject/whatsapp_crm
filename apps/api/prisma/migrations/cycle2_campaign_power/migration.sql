-- CreateTable: contact_groups
CREATE TABLE "contact_groups" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable: group_contacts
CREATE TABLE "group_contacts" (
    "id" TEXT NOT NULL,
    "contact_group_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: campaign_groups
CREATE TABLE "campaign_groups" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "contact_group_id" TEXT NOT NULL,

    CONSTRAINT "campaign_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable: saved_filters
CREATE TABLE "saved_filters" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

-- AlterTable: campaigns — add new columns
ALTER TABLE "campaigns"
    ADD COLUMN "timezone" TEXT,
    ADD COLUMN "expires_at" TIMESTAMP(3),
    ADD COLUMN "campaign_type" TEXT NOT NULL DEFAULT 'template',
    ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "contact_groups_organization_id_idx" ON "contact_groups"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_contacts_contact_group_id_contact_id_key" ON "group_contacts"("contact_group_id", "contact_id");
CREATE INDEX "group_contacts_contact_group_id_idx" ON "group_contacts"("contact_group_id");
CREATE INDEX "group_contacts_contact_id_idx" ON "group_contacts"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_groups_campaign_id_contact_group_id_key" ON "campaign_groups"("campaign_id", "contact_group_id");
CREATE INDEX "campaign_groups_campaign_id_idx" ON "campaign_groups"("campaign_id");

-- CreateIndex
CREATE INDEX "saved_filters_organization_id_idx" ON "saved_filters"("organization_id");

-- AddForeignKey
ALTER TABLE "group_contacts" ADD CONSTRAINT "group_contacts_contact_group_id_fkey"
    FOREIGN KEY ("contact_group_id") REFERENCES "contact_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_groups" ADD CONSTRAINT "campaign_groups_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_groups" ADD CONSTRAINT "campaign_groups_contact_group_id_fkey"
    FOREIGN KEY ("contact_group_id") REFERENCES "contact_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

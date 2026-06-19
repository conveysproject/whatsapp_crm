-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "lead_status_id" TEXT;

-- CreateTable
CREATE TABLE "lead_statuses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_closure" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_statuses_organization_id_sort_order_idx" ON "lead_statuses"("organization_id", "sort_order");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_lead_status_id_fkey" FOREIGN KEY ("lead_status_id") REFERENCES "lead_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed 7 default lead statuses for every existing organization
INSERT INTO "lead_statuses" ("id", "organization_id", "name", "color", "sort_order", "is_closure", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", s.name, s.color, s.sort_order, s.is_closure, now(), now()
FROM "organizations" o
CROSS JOIN (VALUES
  ('New Lead',       '#F97316', 0, false),
  ('Qualification',  '#22C55E', 1, false),
  ('Needs Analysis', '#3B82F6', 2, false),
  ('Proposal',       '#EC4899', 3, false),
  ('Negotiation',    '#8B5CF6', 4, false),
  ('Closed Won',     '#10B981', 5, true),
  ('Closed Lost',    '#EF4444', 6, true)
) AS s(name, color, sort_order, is_closure);

-- Backfill each contact's lead_status_id from its current lifecycle_stage enum
UPDATE "contacts" c
SET "lead_status_id" = ls."id"
FROM "lead_statuses" ls
WHERE ls."organization_id" = c."organization_id"
  AND ls."name" = CASE c."lifecycle_stage"::text
    WHEN 'lead'     THEN 'New Lead'
    WHEN 'prospect' THEN 'Qualification'
    WHEN 'customer' THEN 'Closed Won'
    WHEN 'loyal'    THEN 'Closed Won'
    WHEN 'churned'  THEN 'Closed Lost'
  END;

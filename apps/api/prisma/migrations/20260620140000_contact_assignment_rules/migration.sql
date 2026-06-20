-- 4a: account owner assignment rules
CREATE TABLE "contact_assignment_rules" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "conditions" JSONB NOT NULL DEFAULT '[]',
  "assign_type" TEXT NOT NULL DEFAULT 'user',
  "assign_to" TEXT NOT NULL,
  "replace_previous" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_assignment_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contact_assignment_rules_organization_id_sort_order_idx" ON "contact_assignment_rules"("organization_id", "sort_order");

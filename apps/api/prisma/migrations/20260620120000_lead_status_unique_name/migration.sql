-- delete-safety: enforce unique lead status name per organization
CREATE UNIQUE INDEX "lead_statuses_organization_id_name_key" ON "lead_statuses"("organization_id", "name");

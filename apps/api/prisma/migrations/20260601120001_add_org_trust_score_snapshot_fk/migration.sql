-- AddForeignKey
ALTER TABLE "org_trust_score_snapshots" ADD CONSTRAINT "org_trust_score_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

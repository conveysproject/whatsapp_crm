-- CreateTable
CREATE TABLE "org_trust_score_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_trust_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_trust_score_snapshots_organization_id_recorded_at_idx" ON "org_trust_score_snapshots"("organization_id", "recorded_at");

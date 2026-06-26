-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('lead', 'member');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "team_id" TEXT,
ADD COLUMN     "team_role" "TeamRole";

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "view_all_contacts" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "users_organization_id_team_id_idx" ON "users"("organization_id", "team_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

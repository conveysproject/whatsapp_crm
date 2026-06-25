-- AlterEnum
ALTER TYPE "CreditType" ADD VALUE 'intent_match';

-- AlterTable
ALTER TABLE "org_automation_settings" ADD COLUMN "intent_matching_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "intent_match_cost_paise" INTEGER NOT NULL DEFAULT 0;

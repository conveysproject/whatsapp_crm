-- AlterEnum: add paused to CampaignStatus
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'paused';

-- AlterTable: campaigns — add message_interval
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "message_interval" INTEGER;

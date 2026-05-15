-- AlterTable: conversations — add unread_count
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "unread_count" INTEGER NOT NULL DEFAULT 0;

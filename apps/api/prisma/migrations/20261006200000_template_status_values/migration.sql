-- Additive: Meta template review states that were previously collapsed into "pending" (or rejected by the enum).
ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'disabled';
ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'in_appeal';
ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'flagged';
ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'limit_exceeded';
ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'pending_deletion';
ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'archived';

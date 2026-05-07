-- CreateEnum
CREATE TYPE "AutoReplyTriggerType" AS ENUM ('contains', 'is', 'starts_with', 'ends_with', 'regex');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('stripe', 'razorpay', 'upi', 'bank_transfer', 'cash', 'other');

-- CreateEnum
CREATE TYPE "ManualSubscriptionStatus" AS ENUM ('active', 'trial', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('subscription', 'credit_purchase', 'refund', 'adjustment');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "CreditType" AS ENUM ('purchase', 'message_sent', 'call_made', 'refund', 'adjustment');

-- CreateTable
CREATE TABLE "auto_replies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger_type" "AutoReplyTriggerType" NOT NULL,
    "trigger_keyword" TEXT NOT NULL,
    "reply_text" TEXT NOT NULL,
    "reply_data" JSONB,
    "flow_id" TEXT,
    "priority_index" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "phone_number" TEXT NOT NULL,
    "full_name" TEXT,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'pending',
    "message_type" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "retries" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "message_id" TEXT,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_subscriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "plan_tier" "PlanTier" NOT NULL,
    "status" "ManualSubscriptionStatus" NOT NULL DEFAULT 'active',
    "charges" DECIMAL(13,4) NOT NULL,
    "charges_frequency" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "gateway_price_id" TEXT,
    "is_auto_recurring" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "remarks" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "amount" DECIMAL(13,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "gateway" "PaymentGateway" NOT NULL,
    "gateway_transaction_id" TEXT,
    "reference_id" TEXT NOT NULL,
    "notes" TEXT,
    "manual_subscription_id" TEXT,
    "stripe_subscription_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "credits" BIGINT NOT NULL,
    "type" "CreditType" NOT NULL,
    "notes" TEXT,
    "message_id" TEXT,
    "call_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'agent',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auto_replies_organization_id_idx" ON "auto_replies"("organization_id");

-- CreateIndex
CREATE INDEX "auto_replies_organization_id_is_active_priority_index_idx" ON "auto_replies"("organization_id", "is_active", "priority_index");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_idx" ON "campaign_recipients"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_status_idx" ON "campaign_recipients"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_recipients_organization_id_campaign_id_status_idx" ON "campaign_recipients"("organization_id", "campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_recipients_contact_id_idx" ON "campaign_recipients"("contact_id");

-- CreateIndex
CREATE INDEX "manual_subscriptions_organization_id_idx" ON "manual_subscriptions"("organization_id");

-- CreateIndex
CREATE INDEX "manual_subscriptions_organization_id_status_idx" ON "manual_subscriptions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_gateway_transaction_id_key" ON "transactions"("gateway_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_reference_id_key" ON "transactions"("reference_id");

-- CreateIndex
CREATE INDEX "transactions_organization_id_idx" ON "transactions"("organization_id");

-- CreateIndex
CREATE INDEX "transactions_organization_id_type_status_idx" ON "transactions"("organization_id", "type", "status");

-- CreateIndex
CREATE INDEX "transactions_organization_id_created_at_idx" ON "transactions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_ledger_organization_id_idx" ON "credit_ledger"("organization_id");

-- CreateIndex
CREATE INDEX "credit_ledger_organization_id_type_idx" ON "credit_ledger"("organization_id", "type");

-- CreateIndex
CREATE INDEX "credit_ledger_organization_id_created_at_idx" ON "credit_ledger"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_ledger_message_id_idx" ON "credit_ledger"("message_id");

-- CreateIndex
CREATE INDEX "organization_members_organization_id_idx" ON "organization_members"("organization_id");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- AddForeignKey
ALTER TABLE "auto_replies" ADD CONSTRAINT "auto_replies_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_subscriptions" ADD CONSTRAINT "manual_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_manual_subscription_id_fkey" FOREIGN KEY ("manual_subscription_id") REFERENCES "manual_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

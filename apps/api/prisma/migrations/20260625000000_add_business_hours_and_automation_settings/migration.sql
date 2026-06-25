-- CreateTable
CREATE TABLE "business_hours" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_automation_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ooo_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ooo_message" TEXT,
    "ooo_message_data" JSONB,
    "welcome_enabled" BOOLEAN NOT NULL DEFAULT false,
    "welcome_personalized" BOOLEAN NOT NULL DEFAULT false,
    "welcome_message" TEXT,
    "welcome_message_data" JSONB,
    "welcome_new_message" TEXT,
    "welcome_new_data" JSONB,
    "welcome_returning_message" TEXT,
    "welcome_returning_data" JSONB,
    "welcome_flow_id" TEXT,
    "delayed_enabled" BOOLEAN NOT NULL DEFAULT false,
    "delayed_minutes" INTEGER NOT NULL DEFAULT 30,
    "delayed_message" TEXT,
    "delayed_message_data" JSONB,
    "delayed_send_with_ooo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_automation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_hours_organization_id_idx" ON "business_hours"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_automation_settings_organization_id_key" ON "org_automation_settings"("organization_id");

-- AddForeignKey
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_automation_settings" ADD CONSTRAINT "org_automation_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Platform-wide billing settings (price bands, free allowance, published switch) as one JSON document per key.
-- Additive only. No row = built-in draft defaults, unpublished (customers see no prices).
CREATE TABLE "billing_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("key")
);

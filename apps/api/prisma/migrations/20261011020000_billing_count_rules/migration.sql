-- Platform-wide, editable counting overrides per Meta pricing category. Default (no row) = follow Meta.
-- mode: 'follow' (count only when Meta charges), 'never' (never count this category), 'always' (count whenever Meta reports pricing).
-- Additive only. Rules apply to messages recorded after the change.
CREATE TABLE "billing_count_rules" (
    "category" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'follow',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    CONSTRAINT "billing_count_rules_pkey" PRIMARY KEY ("category")
);

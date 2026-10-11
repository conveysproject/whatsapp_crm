-- Tax on a statement, in minor units (paise), when the owner has set a GST rate. NULL = no tax line. amount_minor already includes it.
ALTER TABLE "billing_statements" ADD COLUMN "tax_minor" INTEGER;

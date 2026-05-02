-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "industry" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "registered_at" TIMESTAMP(3),
ADD COLUMN     "revenue" TEXT,
ADD COLUMN     "sub_category" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "whatsapp_updates" BOOLEAN;

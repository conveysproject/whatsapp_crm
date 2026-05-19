-- CreateTable
CREATE TABLE "countries" (
    "id" INTEGER NOT NULL,
    "iso_code" CHAR(2),
    "name_capitalized" VARCHAR(100),
    "name" VARCHAR(100) NOT NULL,
    "iso3_code" CHAR(3),
    "iso_num_code" INTEGER,
    "phone_code" INTEGER,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "country_id" INTEGER;

-- CreateIndex
CREATE INDEX "contacts_country_id_idx" ON "contacts"("country_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

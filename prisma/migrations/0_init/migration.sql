-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "animal_images" (
    "id" BIGSERIAL NOT NULL,
    "animal_id" BIGINT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animals" (
    "id" BIGSERIAL NOT NULL,
    "establishment_id" BIGINT NOT NULL,
    "category_key" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "age_months" INTEGER,
    "status" TEXT NOT NULL DEFAULT '',
    "observations" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_sold" BOOLEAN NOT NULL DEFAULT false,
    "profile_image_id" BIGINT,

    CONSTRAINT "animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "establishments" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "herd_total" INTEGER NOT NULL DEFAULT 0,
    "herd_detail" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "establishments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "information_animals" (
    "id" BIGSERIAL NOT NULL,
    "establishment_id" BIGINT NOT NULL,
    "section_key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "animal_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "animal_id" BIGINT,

    CONSTRAINT "information_animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccination_records" (
    "id" BIGSERIAL NOT NULL,
    "location" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "detail" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "establishment_id" BIGINT,
    "record_type" TEXT NOT NULL DEFAULT 'snapshot',
    "movement_type" TEXT,
    "movement_category" TEXT,
    "movement_to_category" TEXT,
    "movement_quantity" INTEGER,

    CONSTRAINT "vaccination_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "animal_images_animal_idx" ON "animal_images"("animal_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "animals_establishment_category_idx" ON "animals"("establishment_id", "category_key", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "animals_establishment_id_category_key_identifier_key" ON "animals"("establishment_id", "category_key", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "establishments_name_key" ON "establishments"("name");

-- CreateIndex
CREATE INDEX "information_animals_establishment_created_at_idx" ON "information_animals"("establishment_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "information_animals_establishment_section_year_idx" ON "information_animals"("establishment_id", "section_key", "year");

-- CreateIndex
CREATE UNIQUE INDEX "information_animals_unique_animal_section_year_idx" ON "information_animals"("animal_id", "section_key", "year") WHERE (animal_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "vaccination_records_created_at_idx" ON "vaccination_records"("created_at" DESC);

-- CreateIndex
CREATE INDEX "vaccination_records_establishment_created_at_idx" ON "vaccination_records"("establishment_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "animal_images" ADD CONSTRAINT "animal_images_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_profile_image_id_fkey" FOREIGN KEY ("profile_image_id") REFERENCES "animal_images"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "information_animals" ADD CONSTRAINT "information_animals_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "information_animals" ADD CONSTRAINT "information_animals_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

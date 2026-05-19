-- CreateTable
CREATE TABLE "counting_sessions" (
    "id" BIGSERIAL NOT NULL,
    "establishment_id" BIGINT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size_bytes" BIGINT NOT NULL DEFAULT 0,
    "manual_count" INTEGER,
    "auto_count" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counting_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "counting_sessions_establishment_created_at_idx" ON "counting_sessions"("establishment_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "counting_sessions" ADD CONSTRAINT "counting_sessions_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

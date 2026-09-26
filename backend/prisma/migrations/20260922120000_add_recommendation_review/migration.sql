CREATE TYPE "RecommendationSource" AS ENUM ('MODEL', 'MANUAL');
ALTER TABLE "triage_versions"
  ADD COLUMN "recommendation_input_fingerprint" VARCHAR(64),
  ADD COLUMN "recommendation_raw_output" TEXT,
  ADD COLUMN "recommendation_model_name" TEXT,
  ADD COLUMN "recommendation_generated_at" TIMESTAMP(3),
  ADD COLUMN "recommendation_claim_token" VARCHAR(128),
  ADD COLUMN "recommendation_claimed_at" TIMESTAMP(3),
  ADD COLUMN "recommendation_claim_fingerprint" VARCHAR(64),
  ADD COLUMN "recommendation_claim_collection_revision" INTEGER,
  ADD COLUMN "recommendation_collection_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recommendation_revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "recommendations"
  ADD COLUMN "source" "RecommendationSource" NOT NULL DEFAULT 'MODEL',
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "updated_by_id" UUID,
  ADD COLUMN "approved_by_id" UUID,
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "recommendations_triage_version_id_sort_order_key" ON "recommendations"("triage_version_id", "sort_order");

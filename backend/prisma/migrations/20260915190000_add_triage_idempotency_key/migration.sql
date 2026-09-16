ALTER TABLE "triages" ADD COLUMN "idempotency_key" VARCHAR(128);

CREATE UNIQUE INDEX "triages_idempotency_key_key" ON "triages"("idempotency_key");

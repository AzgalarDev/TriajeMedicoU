ALTER TABLE "triage_answers" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "triage_questions_triage_version_id_priority_key" ON "triage_questions"("triage_version_id", "priority");

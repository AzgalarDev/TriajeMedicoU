-- DropIndex
DROP INDEX "triage_questions_triage_version_id_priority_idx";

-- AlterTable
ALTER TABLE "triage_answers" ALTER COLUMN "updated_at" DROP DEFAULT;

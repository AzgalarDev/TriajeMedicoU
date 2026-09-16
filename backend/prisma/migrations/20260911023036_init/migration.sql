-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMINISTRATOR', 'PHYSICIAN', 'PATIENT', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "TriageStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('ANSWERED', 'NOT_APPLICABLE', 'UNKNOWN', 'UNABLE_TO_ASSESS');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "sex" "Sex" NOT NULL,
    "national_id" VARCHAR(32) NOT NULL,
    "address" TEXT,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "medical_history" TEXT,
    "allergies" TEXT,
    "current_medications" TEXT,
    "chronic_conditions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triages" (
    "id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "status" "TriageStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "patient_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "triages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_versions" (
    "id" UUID NOT NULL,
    "triage_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "status" "TriageStatus" NOT NULL,
    "preliminary_severity" "Severity",
    "final_severity" "Severity",
    "override_justification" TEXT,
    "model_output" TEXT,
    "private_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_symptoms" (
    "id" UUID NOT NULL,
    "triage_version_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "severity" "Severity",

    CONSTRAINT "triage_symptoms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_questions" (
    "id" UUID NOT NULL,
    "triage_version_id" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "triage_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_answers" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "status" "AnswerStatus" NOT NULL,
    "answer_text" TEXT,
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" UUID NOT NULL,
    "triage_version_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_national_id_key" ON "users"("national_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "patient_profiles_user_id_key" ON "patient_profiles"("user_id");

-- CreateIndex
CREATE INDEX "triages_patient_id_created_at_idx" ON "triages"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "triages_physician_id_created_at_idx" ON "triages"("physician_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "triage_versions_triage_id_version_number_key" ON "triage_versions"("triage_id", "version_number");

-- CreateIndex
CREATE INDEX "triage_symptoms_triage_version_id_idx" ON "triage_symptoms"("triage_version_id");

-- CreateIndex
CREATE INDEX "triage_questions_triage_version_id_priority_idx" ON "triage_questions"("triage_version_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "triage_answers_question_id_key" ON "triage_answers"("question_id");

-- CreateIndex
CREATE INDEX "recommendations_triage_version_id_sort_order_idx" ON "recommendations"("triage_version_id", "sort_order");

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triages" ADD CONSTRAINT "triages_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triages" ADD CONSTRAINT "triages_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_versions" ADD CONSTRAINT "triage_versions_triage_id_fkey" FOREIGN KEY ("triage_id") REFERENCES "triages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_versions" ADD CONSTRAINT "triage_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_versions" ADD CONSTRAINT "triage_versions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_symptoms" ADD CONSTRAINT "triage_symptoms_triage_version_id_fkey" FOREIGN KEY ("triage_version_id") REFERENCES "triage_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_questions" ADD CONSTRAINT "triage_questions_triage_version_id_fkey" FOREIGN KEY ("triage_version_id") REFERENCES "triage_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_answers" ADD CONSTRAINT "triage_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "triage_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_triage_version_id_fkey" FOREIGN KEY ("triage_version_id") REFERENCES "triage_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

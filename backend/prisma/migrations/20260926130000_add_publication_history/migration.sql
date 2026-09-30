-- Additive publication history. Existing triages, versions, and recommendations are untouched.
-- Prisma cannot express these cross-table compound ownership relations directly;
-- the explicit PostgreSQL constraints below are authoritative for aggregate integrity.
CREATE TYPE "PublicationStatus" AS ENUM ('PUBLISHED', 'CORRECTED');
CREATE TYPE "AuditAction" AS ENUM ('PUBLISHED', 'CORRECTED');

CREATE TABLE "publications" (
  "id" UUID NOT NULL,
  "triage_id" UUID NOT NULL,
  "triage_version_id" UUID NOT NULL,
  "published_by_id" UUID NOT NULL,
  "status" "PublicationStatus" NOT NULL DEFAULT 'PUBLISHED',
  "current_revision_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publication_revisions" (
  "id" UUID NOT NULL,
  "publication_id" UUID NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "supersedes_revision_id" UUID,
  "triage_version_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "severity" "Severity",
  "recommendations" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "reason" TEXT,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publication_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL,
  "publication_id" UUID NOT NULL,
  "revision_id" UUID,
  "actor_id" UUID NOT NULL,
  "action" "AuditAction" NOT NULL,
  "before_hash" VARCHAR(64),
  "after_hash" VARCHAR(64),
  "metadata" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "publications_current_revision_id_key" ON "publications"("current_revision_id");
CREATE UNIQUE INDEX "publications_triage_id_triage_version_id_key" ON "publications"("triage_id", "triage_version_id");
CREATE UNIQUE INDEX "publications_id_triage_version_id_key" ON "publications"("id", "triage_version_id");
CREATE UNIQUE INDEX "triage_versions_id_triage_id_key" ON "triage_versions"("id", "triage_id");
CREATE INDEX "publications_triage_id_created_at_idx" ON "publications"("triage_id", "created_at");
CREATE UNIQUE INDEX "publication_revisions_publication_id_revision_number_key" ON "publication_revisions"("publication_id", "revision_number");
CREATE UNIQUE INDEX "publication_revisions_publication_id_id_key" ON "publication_revisions"("publication_id", "id");
CREATE INDEX "publication_revisions_triage_version_id_published_at_idx" ON "publication_revisions"("triage_version_id", "published_at");
CREATE INDEX "publication_revisions_supersedes_revision_id_idx" ON "publication_revisions"("supersedes_revision_id");
CREATE INDEX "audit_events_publication_id_occurred_at_idx" ON "audit_events"("publication_id", "occurred_at");
CREATE INDEX "audit_events_actor_id_occurred_at_idx" ON "audit_events"("actor_id", "occurred_at");

ALTER TABLE "publications" ADD CONSTRAINT "publications_triage_id_fkey" FOREIGN KEY ("triage_id") REFERENCES "triages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_triage_version_id_fkey" FOREIGN KEY ("triage_version_id") REFERENCES "triage_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_triage_id_triage_version_id_fkey" FOREIGN KEY ("triage_version_id", "triage_id") REFERENCES "triage_versions"("id", "triage_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "publication_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_id_current_revision_id_fkey" FOREIGN KEY ("id", "current_revision_id") REFERENCES "publication_revisions"("publication_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revisions" ADD CONSTRAINT "publication_revisions_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revisions" ADD CONSTRAINT "publication_revisions_publication_id_triage_version_id_fkey" FOREIGN KEY ("publication_id", "triage_version_id") REFERENCES "publications"("id", "triage_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revisions" ADD CONSTRAINT "publication_revisions_supersedes_revision_id_fkey" FOREIGN KEY ("supersedes_revision_id") REFERENCES "publication_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revisions" ADD CONSTRAINT "publication_revisions_publication_id_supersedes_revision_id_fkey" FOREIGN KEY ("publication_id", "supersedes_revision_id") REFERENCES "publication_revisions"("publication_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revisions" ADD CONSTRAINT "publication_revisions_triage_version_id_fkey" FOREIGN KEY ("triage_version_id") REFERENCES "triage_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_revisions" ADD CONSTRAINT "publication_revisions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "publication_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_publication_id_revision_id_fkey" FOREIGN KEY ("publication_id", "revision_id") REFERENCES "publication_revisions"("publication_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

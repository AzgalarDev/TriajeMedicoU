import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('publication history migration', () => {
  const migration = readFileSync(join(__dirname, '../../prisma/migrations/20260926130000_add_publication_history/migration.sql'), 'utf8');

  it('adds publication, revision, and audit tables without backfilling or deleting triage history', () => {
    expect(migration).toContain('CREATE TABLE "publications"');
    expect(migration).toContain('CREATE TABLE "publication_revisions"');
    expect(migration).toContain('CREATE TABLE "audit_events"');
    expect(migration.replaceAll(/--.*$/gm, '')).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/m);
  });

  it('uses restrictive foreign keys so historical clinical records cannot be removed through publication history', () => {
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(16);
    expect(migration).toContain('"publications_triage_id_fkey"');
    expect(migration).toContain('"publication_revisions_triage_version_id_fkey"');
  });

  it('binds every publication to a version belonging to the same triage', () => {
    expect(migration).toContain('"publications_triage_id_triage_version_id_fkey"');
    expect(migration).toContain('FOREIGN KEY ("triage_version_id", "triage_id")');
    expect(migration).toContain('REFERENCES "triage_versions"("id", "triage_id")');
  });

  it('binds current, superseded, and audited revisions to their owning publication', () => {
    expect(migration).toContain('FOREIGN KEY ("id", "current_revision_id")');
    expect(migration).toContain('FOREIGN KEY ("publication_id", "supersedes_revision_id")');
    expect(migration).toContain('FOREIGN KEY ("publication_id", "revision_id")');
    expect(migration).toContain('"publication_revisions_publication_id_id_key"');
  });
});

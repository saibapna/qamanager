-- Backward-compatible metadata only. Old bytes remain intact.
ALTER TABLE ulo_uat.ulo_evidence ADD COLUMN IF NOT EXISTS storage_key varchar(500);
ALTER TABLE ulo_uat.template_fixtures ADD COLUMN IF NOT EXISTS storage_key varchar(500);
ALTER TABLE ulo_uat.ulo_output ADD COLUMN IF NOT EXISTS storage_key varchar(500);
ALTER TABLE ulo_uat.ulo_evidence ALTER COLUMN data DROP NOT NULL;

-- New objects can live in Storage; legacy rows continue to use bytea.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ulo_evidence_binary_or_storage' AND conrelid='ulo_uat.ulo_evidence'::regclass) THEN
    ALTER TABLE ulo_uat.ulo_evidence ADD CONSTRAINT ulo_evidence_binary_or_storage CHECK(data IS NOT NULL OR storage_key IS NOT NULL);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='template_fixtures_binary_or_storage' AND conrelid='ulo_uat.template_fixtures'::regclass) THEN
    ALTER TABLE ulo_uat.template_fixtures ADD CONSTRAINT template_fixtures_binary_or_storage CHECK(pdf_data IS NOT NULL OR storage_key IS NOT NULL);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ulo_output_binary_or_storage' AND conrelid='ulo_uat.ulo_output'::regclass) THEN
    ALTER TABLE ulo_uat.ulo_output ADD CONSTRAINT ulo_output_binary_or_storage CHECK(pdf_data IS NOT NULL OR storage_key IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_storage_key ON ulo_uat.ulo_evidence(storage_key) WHERE storage_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fixture_storage_key ON ulo_uat.template_fixtures(storage_key) WHERE storage_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_output_storage_key ON ulo_uat.ulo_output(storage_key) WHERE storage_key IS NOT NULL;

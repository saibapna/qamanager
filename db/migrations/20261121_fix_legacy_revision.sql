ALTER TABLE ulo_uat.ulo_sesi ALTER COLUMN revision SET DEFAULT 1;
UPDATE ulo_uat.ulo_sesi SET revision=1 WHERE revision IS NULL OR revision<1;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ulo_sesi_revision_positive' AND conrelid='ulo_uat.ulo_sesi'::regclass) THEN
   ALTER TABLE ulo_uat.ulo_sesi ADD CONSTRAINT ulo_sesi_revision_positive CHECK(revision>=1);
 END IF;
END $$;
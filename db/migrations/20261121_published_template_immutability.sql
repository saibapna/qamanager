-- Published UAT templates are release artifacts. Their content and metadata
-- cannot be rewritten after publish, including by server-side SQL paths.
-- A first transition from DRAFT (published=false) to published=true is allowed.
-- Existing published templates are not updated or backfilled by this migration.
CREATE OR REPLACE FUNCTION ulo_uat.reject_published_template_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, ulo_uat
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.published THEN
      RAISE EXCEPTION 'Published template cannot be deleted'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.published AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Published template is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION ulo_uat.reject_published_template_change() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'ulo_uat.templates'::regclass
      AND tgname = 'trg_reject_published_template_change'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_reject_published_template_change
    BEFORE UPDATE OR DELETE ON ulo_uat.templates
    FOR EACH ROW
    EXECUTE FUNCTION ulo_uat.reject_published_template_change();
  END IF;
END;
$$;

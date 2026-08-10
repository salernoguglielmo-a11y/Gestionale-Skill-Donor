-- Audit log append-only, garantito dal database e non dal codice applicativo.
-- Anche un bug o una query manuale non possono riscrivere la storia delle azioni.
-- L'unica via di rimozione è la retention amministrativa, che passa da
-- `audit_log_purge` e registra la cancellazione prima di eseguirla.

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  IF current_setting('sdoh.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log è append-only: % non consentito', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
-- Purga controllata: registra l'intenzione, poi cancella entro la finestra di retention.
CREATE OR REPLACE FUNCTION audit_log_purge(retention_days integer) RETURNS integer AS $$
DECLARE
  removed integer;
BEGIN
  INSERT INTO audit_log (actor_type, actor_label, action, entity_type, source, new_value)
  VALUES ('sistema', 'retention', 'audit.purge', 'audit_log', 'retention',
          jsonb_build_object('retention_days', retention_days));

  PERFORM set_config('sdoh.audit_purge', 'on', true);
  DELETE FROM audit_log WHERE created_at < now() - (retention_days || ' days')::interval;
  GET DIAGNOSTICS removed = ROW_COUNT;
  PERFORM set_config('sdoh.audit_purge', 'off', true);
  RETURN removed;
END;
$$ LANGUAGE plpgsql;

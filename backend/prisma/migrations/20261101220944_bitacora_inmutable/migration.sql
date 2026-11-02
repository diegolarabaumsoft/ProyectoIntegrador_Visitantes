-- RNF-06 / HU-15: la bitácora es de solo inserción.
-- Cualquier UPDATE, DELETE o TRUNCATE sobre eventos_bitacora falla.

CREATE OR REPLACE FUNCTION bitacora_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora es inmutable: no se permite % sobre eventos_bitacora', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bitacora_inmutable_fila
  BEFORE UPDATE OR DELETE ON "eventos_bitacora"
  FOR EACH ROW EXECUTE FUNCTION bitacora_inmutable();

CREATE TRIGGER trg_bitacora_inmutable_truncate
  BEFORE TRUNCATE ON "eventos_bitacora"
  FOR EACH STATEMENT EXECUTE FUNCTION bitacora_inmutable();

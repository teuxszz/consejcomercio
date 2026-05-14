-- Migration 024: Matriz de objeções
--
-- A diretoria CONSEJ pediu uma matriz de objeções com respostas sugeridas, para
-- substituir o vácuo do campo `motivo_perda` (texto livre) e padronizar as
-- respostas dos consultores em campo. Cada objeção pode opcionalmente apontar
-- para o lead onde foi observada (`origem_lead_id`).

CREATE TABLE IF NOT EXISTS objecoes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria          TEXT NOT NULL,
    -- preco | tempo | autoridade | concorrencia | necessidade | confianca | outro
  objecao            TEXT NOT NULL,
  resposta_sugerida  TEXT NOT NULL,
  tags               TEXT[] DEFAULT '{}',
  origem_lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
  criado_por_id      UUID REFERENCES perfis(id) ON DELETE SET NULL,
  ativo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_objecoes_categoria ON objecoes(categoria);
CREATE INDEX IF NOT EXISTS idx_objecoes_ativo     ON objecoes(ativo);

CREATE TRIGGER objecoes_updated_at
  BEFORE UPDATE ON objecoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE objecoes ENABLE ROW LEVEL SECURITY;

-- Internos only — clientes não veem nem editam a matriz.
CREATE POLICY "interno_all_objecoes" ON objecoes
  FOR ALL TO authenticated
  USING (public.is_interno()) WITH CHECK (public.is_interno());

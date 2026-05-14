-- Migration 028: Normalização de responsável (TEXT → UUID + FK)
--
-- ⚠️ ADITIVA: as colunas antigas (oportunidades.responsavel TEXT,
-- demandas.responsavel TEXT) NÃO são removidas, apenas duplicadas em *_id.
-- O frontend pode migrar gradualmente. Recomendado dropar o TEXT em uma
-- migração futura depois que todos os consumidores apontarem para o _id.
--
-- Também adiciona clientes.responsavel_id (não existia ainda) — necessário
-- pra RLS role-aware (029) escopar visibilidade por responsável.

-- ─── 1. oportunidades.responsavel_id ─────────────────────────────────────────
ALTER TABLE oportunidades
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES perfis(id) ON DELETE SET NULL;

-- Backfill: tenta casar pelo nome (case-insensitive). Linhas sem match ficam NULL.
UPDATE oportunidades o
   SET responsavel_id = p.id
  FROM perfis p
 WHERE o.responsavel IS NOT NULL
   AND o.responsavel_id IS NULL
   AND LOWER(TRIM(p.nome)) = LOWER(TRIM(o.responsavel));

CREATE INDEX IF NOT EXISTS idx_oportunidades_responsavel_id ON oportunidades(responsavel_id);

-- ─── 2. demandas.responsavel_id ──────────────────────────────────────────────
ALTER TABLE demandas
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES perfis(id) ON DELETE SET NULL;

UPDATE demandas d
   SET responsavel_id = p.id
  FROM perfis p
 WHERE d.responsavel IS NOT NULL
   AND d.responsavel_id IS NULL
   AND LOWER(TRIM(p.nome)) = LOWER(TRIM(d.responsavel));

CREATE INDEX IF NOT EXISTS idx_demandas_responsavel_id ON demandas(responsavel_id);

-- ─── 3. clientes.responsavel_id (não existia) ────────────────────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES perfis(id) ON DELETE SET NULL;

-- Backfill: usa o responsavel_id do lead de origem (se houver)
UPDATE clientes c
   SET responsavel_id = l.responsavel_id
  FROM leads l
 WHERE c.lead_id = l.id
   AND c.responsavel_id IS NULL
   AND l.responsavel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_responsavel_id ON clientes(responsavel_id);

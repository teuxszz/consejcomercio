-- Migration 032: Lixeira de leads — exclusão com snapshot e restauração
--
-- Excluir um lead serializa o lead + reflexos (diagnóstico, interações,
-- tarefas) e os IDs de reuniões/indicações/objeções num snapshot JSONB em
-- leads_lixeira, e então apaga de verdade. Restaurar (coordenador+) re-insere
-- a partir do snapshot preservando os IDs originais.

-- ─── 1. Tabela leads_lixeira ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leads_lixeira (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL,        -- id original; NÃO é FK (o lead não existe mais)
  lead_nome         TEXT,
  lead_empresa      TEXT,
  snapshot          JSONB NOT NULL,
  excluido_por      UUID REFERENCES perfis(id) ON DELETE SET NULL,
  excluido_por_nome TEXT,
  excluido_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  restaurado_em     TIMESTAMPTZ,
  restaurado_por    UUID REFERENCES perfis(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_lixeira_pendentes
  ON leads_lixeira(excluido_em DESC) WHERE restaurado_em IS NULL;

-- ─── 2. Helper de papel ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_coordenador_ou_acima()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis
    WHERE id = auth.uid()
      AND role IN ('coordenador', 'gerente', 'diretor')
  );
$$;

-- ─── 3. RPC excluir_lead ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION excluir_lead(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead       leads%ROWTYPE;
  v_snapshot   JSONB;
  v_lixeira_id UUID;
  v_uid        UUID := auth.uid();
  v_nome       TEXT;
BEGIN
  IF NOT public.is_interno() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado.';
  END IF;

  IF EXISTS (SELECT 1 FROM clientes WHERE lead_id = p_id) THEN
    RAISE EXCEPTION 'Este lead já virou cliente; exclua o cliente, não o lead.';
  END IF;

  SELECT jsonb_build_object(
    'lead',           to_jsonb(v_lead),
    'diagnostico',    (SELECT to_jsonb(d) FROM diagnosticos d WHERE d.lead_id = p_id),
    'interacoes',     COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM interacoes_lead i WHERE i.lead_id = p_id), '[]'::jsonb),
    'tarefas',        COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM tarefas t WHERE t.entidade_tipo = 'lead' AND t.entidade_id = p_id), '[]'::jsonb),
    'reunioes_ids',   COALESCE((SELECT jsonb_agg(r.id) FROM reunioes r WHERE r.lead_id = p_id), '[]'::jsonb),
    'indicacoes_ids', COALESCE((SELECT jsonb_agg(ind.id) FROM indicacoes ind WHERE ind.lead_id = p_id), '[]'::jsonb),
    'objecoes_ids',   COALESCE((SELECT jsonb_agg(o.id) FROM objecoes o WHERE o.origem_lead_id = p_id), '[]'::jsonb)
  ) INTO v_snapshot;

  SELECT nome INTO v_nome FROM perfis WHERE id = v_uid;

  INSERT INTO leads_lixeira (lead_id, lead_nome, lead_empresa, snapshot, excluido_por, excluido_por_nome)
  VALUES (p_id, v_lead.nome, v_lead.empresa, v_snapshot, v_uid, v_nome)
  RETURNING id INTO v_lixeira_id;

  -- Cascade apaga diagnóstico + interações; trigger 025 apaga tarefas;
  -- reuniões/indicações/objeções têm o lead_id zerado por SET NULL.
  DELETE FROM leads WHERE id = p_id;

  INSERT INTO audit_logs (tabela, registro_id, acao, valor_antes, usuario)
  VALUES ('leads', p_id, 'excluido', to_jsonb(v_lead), v_nome);

  RETURN v_lixeira_id;
END;
$$;

-- ─── 4. RPC restaurar_lead ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION restaurar_lead(p_lixeira_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     leads_lixeira%ROWTYPE;
  v_snap    JSONB;
  v_lead_id UUID;
  v_uid     UUID := auth.uid();
  v_nome    TEXT;
BEGIN
  IF NOT public.is_coordenador_ou_acima() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM leads_lixeira WHERE id = p_lixeira_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de lixeira não encontrado.';
  END IF;
  IF v_row.restaurado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este lead já foi restaurado.';
  END IF;

  v_snap    := v_row.snapshot;
  v_lead_id := v_row.lead_id;

  IF EXISTS (SELECT 1 FROM leads WHERE id = v_lead_id) THEN
    RAISE EXCEPTION 'O lead já existe; não é possível restaurar.';
  END IF;

  INSERT INTO leads SELECT * FROM jsonb_populate_record(NULL::leads, v_snap->'lead');

  IF v_snap->'diagnostico' IS NOT NULL AND jsonb_typeof(v_snap->'diagnostico') = 'object' THEN
    INSERT INTO diagnosticos
      SELECT * FROM jsonb_populate_record(NULL::diagnosticos, v_snap->'diagnostico');
  END IF;

  INSERT INTO interacoes_lead
    SELECT * FROM jsonb_populate_recordset(NULL::interacoes_lead, v_snap->'interacoes');

  INSERT INTO tarefas
    SELECT * FROM jsonb_populate_recordset(NULL::tarefas, v_snap->'tarefas');

  -- Re-vínculo: registros que já não existem não casam no WHERE e são ignorados.
  UPDATE reunioes   SET lead_id = v_lead_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snap->'reunioes_ids')::uuid);
  UPDATE indicacoes SET lead_id = v_lead_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snap->'indicacoes_ids')::uuid);
  UPDATE objecoes   SET origem_lead_id = v_lead_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snap->'objecoes_ids')::uuid);

  SELECT nome INTO v_nome FROM perfis WHERE id = v_uid;

  UPDATE leads_lixeira
    SET restaurado_em = now(), restaurado_por = v_uid
    WHERE id = p_lixeira_id;

  INSERT INTO audit_logs (tabela, registro_id, acao, usuario)
  VALUES ('leads', v_lead_id, 'restaurado', v_nome);

  RETURN v_lead_id;
END;
$$;

-- ─── 5. RLS e grants ─────────────────────────────────────────────────────────

ALTER TABLE leads_lixeira ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_lixeira_select_internos ON leads_lixeira;
CREATE POLICY leads_lixeira_select_internos ON leads_lixeira
  FOR SELECT USING (public.is_interno());
-- Sem policy de INSERT/UPDATE/DELETE: gravação só via RPC SECURITY DEFINER.

GRANT SELECT ON leads_lixeira TO authenticated;
GRANT EXECUTE ON FUNCTION is_coordenador_ou_acima()   TO authenticated;
GRANT EXECUTE ON FUNCTION excluir_lead(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION restaurar_lead(UUID)        TO authenticated;
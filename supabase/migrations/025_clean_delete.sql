-- Migration 025: Exclusão limpa de leads/clientes/contratos
--
-- Objetivos:
--   1. Não deixar tarefas órfãs depois de excluir um lead/cliente/contrato/etc.
--   2. Bloquear deletes que quebrariam o CHECK indicacoes_must_have_referrer
--      (com mensagem clara em vez do erro SQL bruto).
--   3. RPC inspecionar_exclusao() para a UI mostrar o impacto antes do delete.
--
-- Soft-delete em clientes (que protege histórico de contratos) é tratado
-- separadamente numa migração futura — afeta muitos consumidores e merece
-- mudança coordenada.

-- ─── 1. Limpeza de tarefas órfãs ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_orphan_tarefas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM tarefas
  WHERE entidade_tipo = TG_ARGV[0]
    AND entidade_id   = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_orphan_tarefas_leads          ON leads;
DROP TRIGGER IF EXISTS cleanup_orphan_tarefas_clientes       ON clientes;
DROP TRIGGER IF EXISTS cleanup_orphan_tarefas_contratos      ON contratos;
DROP TRIGGER IF EXISTS cleanup_orphan_tarefas_oportunidades  ON oportunidades;
DROP TRIGGER IF EXISTS cleanup_orphan_tarefas_reunioes       ON reunioes;
DROP TRIGGER IF EXISTS cleanup_orphan_tarefas_indicacoes     ON indicacoes;

CREATE TRIGGER cleanup_orphan_tarefas_leads
  AFTER DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION cleanup_orphan_tarefas('lead');

CREATE TRIGGER cleanup_orphan_tarefas_clientes
  AFTER DELETE ON clientes
  FOR EACH ROW EXECUTE FUNCTION cleanup_orphan_tarefas('cliente');

CREATE TRIGGER cleanup_orphan_tarefas_contratos
  AFTER DELETE ON contratos
  FOR EACH ROW EXECUTE FUNCTION cleanup_orphan_tarefas('contrato');

CREATE TRIGGER cleanup_orphan_tarefas_oportunidades
  AFTER DELETE ON oportunidades
  FOR EACH ROW EXECUTE FUNCTION cleanup_orphan_tarefas('oportunidade');

CREATE TRIGGER cleanup_orphan_tarefas_reunioes
  AFTER DELETE ON reunioes
  FOR EACH ROW EXECUTE FUNCTION cleanup_orphan_tarefas('reuniao');

CREATE TRIGGER cleanup_orphan_tarefas_indicacoes
  AFTER DELETE ON indicacoes
  FOR EACH ROW EXECUTE FUNCTION cleanup_orphan_tarefas('indicacao');

-- ─── 2. Bloqueio de delete que orfaniza indicações ───────────────────────────
-- O CHECK indicacoes_must_have_referrer exige que pelo menos um dos três
-- (indicante_cliente_id, indicante_parceiro_id, indicante_perfil_id) seja não-nulo.
-- Deletar um referrer único faz SET NULL e estoura o CHECK no momento do delete.
-- Esse trigger BEFORE DELETE detecta antes e devolve mensagem clara.

CREATE OR REPLACE FUNCTION prevent_orphan_indicacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col_name TEXT;
  v_count    INT;
BEGIN
  -- Decide qual coluna verificar
  IF TG_TABLE_NAME = 'clientes' THEN
    v_col_name := 'indicante_cliente_id';
  ELSIF TG_TABLE_NAME = 'parceiros' THEN
    v_col_name := 'indicante_parceiro_id';
  ELSIF TG_TABLE_NAME = 'perfis' THEN
    v_col_name := 'indicante_perfil_id';
  ELSE
    RETURN OLD;
  END IF;

  -- Conta indicações em que esta entidade é o ÚNICO referrer
  EXECUTE format($q$
    SELECT COUNT(*) FROM indicacoes
    WHERE %I = $1
      AND COALESCE(indicante_cliente_id, indicante_parceiro_id, indicante_perfil_id) IS NOT NULL
      AND (
        (indicante_cliente_id  IS NOT NULL)::int +
        (indicante_parceiro_id IS NOT NULL)::int +
        (indicante_perfil_id   IS NOT NULL)::int
      ) = 1
  $q$, v_col_name)
  USING OLD.id
  INTO v_count;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Não é possível excluir: % indicaç%s teri%m essa entidade como único referrer. Atribua outro referrer antes de excluir.',
      v_count,
      CASE WHEN v_count > 1 THEN 'õe' ELSE 'ã' END,
      CASE WHEN v_count > 1 THEN 'a' ELSE 'a' END
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_orphan_indicacao_clientes  ON clientes;
DROP TRIGGER IF EXISTS prevent_orphan_indicacao_parceiros ON parceiros;
DROP TRIGGER IF EXISTS prevent_orphan_indicacao_perfis    ON perfis;

CREATE TRIGGER prevent_orphan_indicacao_clientes
  BEFORE DELETE ON clientes
  FOR EACH ROW EXECUTE FUNCTION prevent_orphan_indicacao();

CREATE TRIGGER prevent_orphan_indicacao_parceiros
  BEFORE DELETE ON parceiros
  FOR EACH ROW EXECUTE FUNCTION prevent_orphan_indicacao();

CREATE TRIGGER prevent_orphan_indicacao_perfis
  BEFORE DELETE ON perfis
  FOR EACH ROW EXECUTE FUNCTION prevent_orphan_indicacao();

-- ─── 3. RPC: inspecionar_exclusao(entidade_tipo, id) ─────────────────────────
-- Retorna JSON com a contagem de registros que serão afetados/excluídos quando
-- a entidade for deletada. A UI usa para mostrar pré-visualização do impacto.

CREATE OR REPLACE FUNCTION inspecionar_exclusao(
  p_entidade_tipo TEXT,
  p_id            UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_tarefas        INT;
  v_diagnosticos   INT;
  v_interacoes     INT;
  v_indicacoes_set INT;
  v_indicacoes_blq INT;
  v_oportunidades  INT;
  v_contratos      INT;
  v_demandas       INT;
  v_reunioes       INT;
  v_clientes       INT;
BEGIN
  IF NOT public.is_interno() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Tarefas vinculadas via (entidade_tipo, entidade_id) — sempre apagadas pelo trigger
  SELECT COUNT(*) INTO v_tarefas
    FROM tarefas WHERE entidade_tipo = p_entidade_tipo AND entidade_id = p_id;

  IF p_entidade_tipo = 'lead' THEN
    SELECT COUNT(*) INTO v_diagnosticos FROM diagnosticos WHERE lead_id = p_id;
    SELECT COUNT(*) INTO v_interacoes  FROM interacoes_lead WHERE lead_id = p_id;
    SELECT COUNT(*) INTO v_indicacoes_set FROM indicacoes WHERE lead_id = p_id;
    SELECT COUNT(*) INTO v_clientes    FROM clientes WHERE lead_id = p_id;
    SELECT COUNT(*) INTO v_reunioes    FROM reunioes WHERE lead_id = p_id;

    v_result := jsonb_build_object(
      'tarefas_excluidas',         v_tarefas,
      'diagnosticos_excluidos',    v_diagnosticos,
      'interacoes_excluidas',      v_interacoes,
      'indicacoes_desvinculadas',  v_indicacoes_set,
      'clientes_desvinculados',    v_clientes,
      'reunioes_desvinculadas',    v_reunioes
    );

  ELSIF p_entidade_tipo = 'cliente' THEN
    SELECT COUNT(*) INTO v_contratos     FROM contratos WHERE cliente_id = p_id;
    SELECT COUNT(*) INTO v_oportunidades FROM oportunidades WHERE cliente_id = p_id;
    SELECT COUNT(*) INTO v_demandas      FROM demandas WHERE cliente_id = p_id;
    SELECT COUNT(*) INTO v_indicacoes_set FROM indicacoes
      WHERE indicante_cliente_id = p_id;
    SELECT COUNT(*) INTO v_indicacoes_blq FROM indicacoes
      WHERE indicante_cliente_id = p_id
        AND COALESCE(indicante_parceiro_id, indicante_perfil_id) IS NULL;
    SELECT COUNT(*) INTO v_reunioes      FROM reunioes WHERE cliente_id = p_id;

    v_result := jsonb_build_object(
      'tarefas_excluidas',         v_tarefas,
      'contratos_excluidos',       v_contratos,
      'oportunidades_excluidas',   v_oportunidades,
      'demandas_excluidas',        v_demandas,
      'indicacoes_desvinculadas',  v_indicacoes_set - v_indicacoes_blq,
      'indicacoes_bloqueadoras',   v_indicacoes_blq,
      'reunioes_desvinculadas',    v_reunioes
    );

  ELSIF p_entidade_tipo = 'contrato' THEN
    SELECT COUNT(*) INTO v_demandas      FROM demandas WHERE contrato_id = p_id;
    SELECT COUNT(*) INTO v_oportunidades FROM oportunidades WHERE contrato_id = p_id;

    v_result := jsonb_build_object(
      'tarefas_excluidas',         v_tarefas,
      'demandas_excluidas',        v_demandas,
      'oportunidades_desvinculadas', v_oportunidades
    );

  ELSIF p_entidade_tipo = 'parceiro' THEN
    SELECT COUNT(*) INTO v_indicacoes_set FROM indicacoes WHERE indicante_parceiro_id = p_id;
    SELECT COUNT(*) INTO v_indicacoes_blq FROM indicacoes
      WHERE indicante_parceiro_id = p_id
        AND COALESCE(indicante_cliente_id, indicante_perfil_id) IS NULL;

    v_result := jsonb_build_object(
      'indicacoes_desvinculadas',  v_indicacoes_set - v_indicacoes_blq,
      'indicacoes_bloqueadoras',   v_indicacoes_blq
    );

  ELSE
    v_result := jsonb_build_object('tarefas_excluidas', v_tarefas);
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION inspecionar_exclusao(TEXT, UUID) TO authenticated;

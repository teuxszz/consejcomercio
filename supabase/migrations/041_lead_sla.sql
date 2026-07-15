-- Migration 041: lead_sla — o RELÓGIO do SLA de follow-up (Phase 999.1 Plan 01)
--
-- Tabela dedicada que registra, por lead, quando ele entrou na fase atual
-- (entered_at) e o prazo-limite do próximo contato (deadline_at). NÃO usa
-- leads.updated_at (é tocado por qualquer edição do lead) — o relógio é
-- entered_at, recomputado só quando o STATUS muda (D-02 do CONTEXT).
--
-- Escrita em lead_sla é EXCLUSIVA de:
--   - trigger upsert_lead_sla()  (SECURITY DEFINER, dispara em leads)
--   - trigger resolve_lead_sla() (SECURITY DEFINER, dispara em interacoes_lead)
--   - service_role (edge functions do cron de scan / dispatch — Plans 03/04)
-- Nenhuma policy de INSERT/UPDATE/DELETE é criada para `authenticated`
-- (T-999.1-03). Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER
-- IF EXISTS em todo o arquivo.
--
-- Fases sem SLA (relógio pausado ou fase terminal) — lista idêntica ao
-- SLA_EXCLUDED_STAGES de src/lib/sla-followup.ts:
--   ganho_assessoria, ganho_consultoria, perdido, cancelado, stand_by

-- ─── 1. Tabela lead_sla ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_sla (
  lead_id           UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  stage             TEXT NOT NULL,
  entered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at       TIMESTAMPTZ NOT NULL,
  warning_sent_at   TIMESTAMPTZ,
  escalated_at      TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  -- Guardado para um enhancement futuro (auto-delete do bloco na Google
  -- Agenda ao resolver o SLA) — NUNCA apagado no MVP (D-05 do CONTEXT).
  calendar_event_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice parcial para o scan do cron (Plan 04) — só linhas ainda abertas.
CREATE INDEX IF NOT EXISTS idx_lead_sla_scan
  ON public.lead_sla (deadline_at)
  WHERE resolved_at IS NULL;

-- ─── 2. upsert_lead_sla() — recomputa o prazo em criação/mudança de fase ─────
CREATE OR REPLACE FUNCTION public.upsert_lead_sla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_horas     NUMERIC;
  v_metas     JSONB;
BEGIN
  -- Guarda anti-reset (Pitfall 5, T-999.1-10): em UPDATE, se o status não
  -- mudou (edição benigna de outro campo do lead), não mexe no relógio.
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Fase terminal ou stand_by (Pitfall 6, T-999.1-11): sem SLA — relógio
  -- pausado/encerrado. Apaga qualquer linha aberta anterior.
  IF NEW.status IN ('ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado', 'stand_by') THEN
    DELETE FROM public.lead_sla WHERE lead_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Lê horas configuradas em configuracoes.metas (Plan 06 é quem grava os
  -- valores reais). Defesa em profundidade: cai em 24h se as chaves
  -- ainda não existem — mesma fórmula do helper TS (slaConfigFromMetas).
  SELECT metas INTO v_metas FROM public.configuracoes WHERE id = 'default';

  v_horas := COALESCE(
    (v_metas -> 'sla_followup_horas_por_stage' ->> NEW.status)::numeric,
    (v_metas ->> 'sla_followup_horas_default')::numeric,
    24
  );

  INSERT INTO public.lead_sla (lead_id, stage, entered_at, deadline_at)
  VALUES (NEW.id, NEW.status, now(), now() + (v_horas || ' hours')::interval)
  ON CONFLICT (lead_id) DO UPDATE SET
    stage             = EXCLUDED.stage,
    entered_at        = EXCLUDED.entered_at,
    deadline_at       = EXCLUDED.deadline_at,
    warning_sent_at   = NULL,
    escalated_at      = NULL,
    resolved_at       = NULL,
    calendar_event_id = NULL,
    updated_at        = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upsert_lead_sla ON public.leads;
CREATE TRIGGER trg_upsert_lead_sla
  AFTER INSERT OR UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.upsert_lead_sla();

-- ─── 3. resolve_lead_sla() — resolve a linha aberta ao registrar interação ───
CREATE OR REPLACE FUNCTION public.resolve_lead_sla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lead_sla
     SET resolved_at = now(),
         updated_at  = now()
   WHERE lead_id = NEW.lead_id
     AND resolved_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_lead_sla ON public.interacoes_lead;
CREATE TRIGGER trg_resolve_lead_sla
  AFTER INSERT ON public.interacoes_lead
  FOR EACH ROW EXECUTE FUNCTION public.resolve_lead_sla();

-- ─── 4. RLS — SELECT role-aware; sem policy de escrita para authenticated ────
ALTER TABLE public.lead_sla ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interno_role_aware_lead_sla ON public.lead_sla;
CREATE POLICY interno_role_aware_lead_sla ON public.lead_sla
  FOR SELECT TO authenticated
  USING (
    public.is_interno()
    AND EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id = lead_sla.lead_id
         AND public.can_see_responsavel(l.responsavel_id)
    )
  );
-- Sem policy INSERT/UPDATE/DELETE para authenticated (T-999.1-03) — escrita
-- só via upsert_lead_sla()/resolve_lead_sla() (SECURITY DEFINER) ou service_role.

-- ─── 5. Extensão aditiva do CHECK de notificacoes_envios.tipo (D-06) ─────────
-- Postgres não suporta ALTER CONSTRAINT CHECK para mudar a expressão —
-- pattern canônico é DROP + ADD (mesmo usado em 036/037). Preserva os
-- valores já existentes (035 + 037) e soma os 2 novos tipos de log do SLA.
-- Idempotência do dispatch de warning/escalação NÃO depende deste CHECK
-- (vive em lead_sla via CAS em warning_sent_at/escalated_at — Plan 03/04);
-- estes tipos são só para log/observabilidade em notificacoes_envios.
ALTER TABLE public.notificacoes_envios DROP CONSTRAINT IF EXISTS notificacoes_envios_tipo_check;
ALTER TABLE public.notificacoes_envios
  ADD CONSTRAINT notificacoes_envios_tipo_check
  CHECK (tipo IN ('tarefa','cadencia','renovacao','indicacao','documentos','sla_warning','sla_escalonamento'));

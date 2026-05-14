-- Migration 026: Notificações de renovação (idempotência do cron Slack)
--
-- O cron diário em api/cron-renovacoes.ts identifica contratos com data_fim
-- caindo em janelas pré-definidas (30 dias por padrão) e dispara a edge
-- function notify-renovacao via Slack. Esta tabela garante que cada
-- (contrato_id, dias_antes) seja notificado no máximo uma vez.

CREATE TABLE IF NOT EXISTS notificacoes_renovacao_enviadas (
  contrato_id  UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  dias_antes   INT NOT NULL,
  enviada_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  slack_ts     TEXT,
  status       TEXT NOT NULL DEFAULT 'enviado',  -- enviado | erro
  erro_msg     TEXT,
  PRIMARY KEY (contrato_id, dias_antes)
);

CREATE INDEX IF NOT EXISTS idx_notif_renov_contrato ON notificacoes_renovacao_enviadas(contrato_id);

ALTER TABLE notificacoes_renovacao_enviadas ENABLE ROW LEVEL SECURITY;

-- Interno-only — clientes não veem o log.
CREATE POLICY "interno_all_notif_renov" ON notificacoes_renovacao_enviadas
  FOR ALL TO authenticated
  USING (public.is_interno()) WITH CHECK (public.is_interno());

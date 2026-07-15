-- Migration 042: google_calendar_tokens — COFRE de credenciais do Google Calendar
-- (Phase 999.1 Plan 02)
--
-- refresh_token do Google é credencial de TERCEIRO, de longa vida (D-01):
-- se vazar (XSS, sessão comprometida), o atacante ganha acesso persistente à
-- Google Agenda do dono até revogação manual no Google. Por isso a RLS de
-- leitura é ZERO: NENHUMA policy SELECT é criada para `authenticated` — nem
-- o dono lê a própria linha (T-999.1-01, espelha a filosofia da 040/035).
--
-- Acesso de leitura autorizado:
--   - service_role (edge function do Plan 03/04, via getValidAccessToken) —
--     bypassa RLS.
--   - RPC google_calendar_status() (SECURITY DEFINER) — devolve só
--     boolean+expiry, NUNCA o token.
--
-- Escrita: o browser faz upsert da PRÓPRIA linha logo após o linkIdentity
-- (Plan 05), escopado por `perfil_id = auth.uid()` (T-999.1-08). Desconexão
-- é via RPC google_calendar_disconnect() (sem policy DELETE para authenticated).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY
-- IF EXISTS / DROP TRIGGER IF EXISTS em todo o arquivo.

-- ─── 1. Tabela google_calendar_tokens ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
  perfil_id               UUID PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  refresh_token           TEXT NOT NULL,
  access_token            TEXT,
  access_token_expires_at TIMESTAMPTZ,
  scope                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. RLS — zero leitura para authenticated ────────────────────────────────
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- NENHUMA policy FOR SELECT é criada aqui (T-999.1-01). Sem policy SELECT,
-- Postgres nega toda leitura a `authenticated` por padrão — nem o dono lê a
-- própria linha. O único leitor legítimo do token é service_role (bypassa
-- RLS) via getValidAccessToken (_shared/google-calendar.ts, Plan 02/03).

DROP POLICY IF EXISTS own_row_insert ON public.google_calendar_tokens;
CREATE POLICY own_row_insert ON public.google_calendar_tokens
  FOR INSERT TO authenticated
  WITH CHECK (perfil_id = auth.uid());

DROP POLICY IF EXISTS own_row_update ON public.google_calendar_tokens;
CREATE POLICY own_row_update ON public.google_calendar_tokens
  FOR UPDATE TO authenticated
  USING (perfil_id = auth.uid())
  WITH CHECK (perfil_id = auth.uid());

-- Sem policy DELETE para authenticated — desconexão é exclusivamente via RPC
-- google_calendar_disconnect() (SECURITY DEFINER, abaixo).

-- ─── 3. RPC google_calendar_status() — status booleano, nunca o token ────────
CREATE OR REPLACE FUNCTION public.google_calendar_status()
RETURNS TABLE(conectado boolean, expira_em timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS(SELECT 1 FROM public.google_calendar_tokens WHERE perfil_id = auth.uid()) AS conectado,
    (SELECT access_token_expires_at FROM public.google_calendar_tokens WHERE perfil_id = auth.uid()) AS expira_em;
$$;

GRANT EXECUTE ON FUNCTION public.google_calendar_status() TO authenticated;

-- ─── 4. RPC google_calendar_disconnect() — apaga a própria linha ─────────────
CREATE OR REPLACE FUNCTION public.google_calendar_disconnect()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.google_calendar_tokens WHERE perfil_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.google_calendar_disconnect() TO authenticated;

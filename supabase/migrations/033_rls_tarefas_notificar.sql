-- Migration 033: Fecha RLS de tarefas (SEC-01) + coluna notificar (SEC-02)
--
-- SEC-01: Substitui policy "authenticated_all" por 4 policies is_interno()
--         separadas — clientes autenticados via portal não conseguem mais
--         SELECT/INSERT/UPDATE/DELETE em tarefas internas.
--
-- SEC-02: Adiciona coluna `notificar boolean NOT NULL DEFAULT true` para que
--         tarefas derivadas de cadência possam suprimir DM Slack setando false.

-- SEC-02: coluna de opt-out de notificação
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS notificar boolean NOT NULL DEFAULT true;

-- Temporariamente desativar RLS para recriar policies sem lock
ALTER TABLE tarefas DISABLE ROW LEVEL SECURITY;

-- SEC-01: remover policy aberta herdada da migration 014
DROP POLICY IF EXISTS "authenticated_all" ON tarefas;

-- Quatro policies separadas (por operação) para permitir refinamento granular
-- futuro sem recriar tudo. Todas gated em public.is_interno() definida em 021.

CREATE POLICY "interno_select_tarefas" ON tarefas
  FOR SELECT TO authenticated
  USING (public.is_interno());

CREATE POLICY "interno_insert_tarefas" ON tarefas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_interno());

CREATE POLICY "interno_update_tarefas" ON tarefas
  FOR UPDATE TO authenticated
  USING (public.is_interno()) WITH CHECK (public.is_interno());

CREATE POLICY "interno_delete_tarefas" ON tarefas
  FOR DELETE TO authenticated
  USING (public.is_interno());

ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;

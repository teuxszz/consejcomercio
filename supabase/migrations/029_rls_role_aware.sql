-- Migration 029: RLS role-aware — DIRETOR/GERENTE/COORDENADOR/CONSULTOR
--
-- ⚠️⚠️⚠️ MUDANÇA DE COMPORTAMENTO ⚠️⚠️⚠️
--
-- Antes desta migração, qualquer perfil com tipo='interno' via TUDO. Depois,
-- a visibilidade fica escopada por role + cadeia de gestão (gestor_id).
--
-- Cenários após aplicar:
--   - DIRETOR  → vê tudo
--   - GERENTE  → vê dados próprios + dados dos subordinados (transitivo, ≤5 níveis)
--   - COORDENADOR / CONSULTOR → vê só dados próprios
--   - CLIENTE  → policies do portal continuam intactas (não toco aqui)
--
-- 🛑 ANTES DE APLICAR:
--   1. Confirme que a 027 e 028 já rodaram
--   2. Promova manualmente os diretores/gerentes:
--        UPDATE perfis SET role='diretor' WHERE email='gabriel@consej.com';
--        UPDATE perfis SET role='gerente', gestor_id=(SELECT id FROM perfis WHERE email='gabriel@consej.com')
--          WHERE email='maju@consej.com';
--   3. Teste primeiro em ambiente staging se possível
--
-- 🔄 ROLLBACK rápido (se algo quebrar):
--   Reaplique as policies de 021_lockdown_rls.sql trocando as criadas abaixo.

-- ─── Helper compartilhado: pode ver linha cuja responsabilidade é target? ────
-- target NULL ⇒ não escopado por responsável (qualquer interno vê)
CREATE OR REPLACE FUNCTION public.can_see_responsavel(target UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_diretor()
    OR target IS NULL
    OR target = auth.uid()
    OR public.can_see_perfil(target)
$$;

GRANT EXECUTE ON FUNCTION public.can_see_responsavel(UUID) TO authenticated;

-- ─── LEADS ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "interno_all_leads" ON leads;
CREATE POLICY "interno_role_aware_leads" ON leads
  FOR ALL TO authenticated
  USING (public.is_interno() AND public.can_see_responsavel(responsavel_id))
  WITH CHECK (public.is_interno() AND public.can_see_responsavel(responsavel_id));

-- ─── CLIENTES ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "interno_all_clientes" ON clientes;
CREATE POLICY "interno_role_aware_clientes" ON clientes
  FOR ALL TO authenticated
  USING (public.is_interno() AND public.can_see_responsavel(responsavel_id))
  WITH CHECK (public.is_interno() AND public.can_see_responsavel(responsavel_id));

-- ─── CONTRATOS ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "interno_all_contratos" ON contratos;
CREATE POLICY "interno_role_aware_contratos" ON contratos
  FOR ALL TO authenticated
  USING (public.is_interno() AND public.can_see_responsavel(responsavel_id))
  WITH CHECK (public.is_interno() AND public.can_see_responsavel(responsavel_id));

-- ─── OPORTUNIDADES ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "interno_all_oportunidades" ON oportunidades;
CREATE POLICY "interno_role_aware_oportunidades" ON oportunidades
  FOR ALL TO authenticated
  USING (public.is_interno() AND public.can_see_responsavel(responsavel_id))
  WITH CHECK (public.is_interno() AND public.can_see_responsavel(responsavel_id));

-- ─── DEMANDAS ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "interno_all_demandas" ON demandas;
CREATE POLICY "interno_role_aware_demandas" ON demandas
  FOR ALL TO authenticated
  USING (public.is_interno() AND public.can_see_responsavel(responsavel_id))
  WITH CHECK (public.is_interno() AND public.can_see_responsavel(responsavel_id));

-- ─── REUNIOES ────────────────────────────────────────────────────────────────
-- (reunioes.responsavel_id veio na 004_perfis.sql)
DROP POLICY IF EXISTS "authenticated_all" ON reunioes;
DROP POLICY IF EXISTS "interno_all_reunioes" ON reunioes;
CREATE POLICY "interno_role_aware_reunioes" ON reunioes
  FOR ALL TO authenticated
  USING (public.is_interno() AND public.can_see_responsavel(responsavel_id))
  WITH CHECK (public.is_interno() AND public.can_see_responsavel(responsavel_id));

-- ─── DIAGNOSTICOS — herda do lead ────────────────────────────────────────────
DROP POLICY IF EXISTS "interno_all_diagnosticos" ON diagnosticos;
CREATE POLICY "interno_role_aware_diagnosticos" ON diagnosticos
  FOR ALL TO authenticated
  USING (
    public.is_interno()
    AND EXISTS (
      SELECT 1 FROM leads l
       WHERE l.id = diagnosticos.lead_id
         AND public.can_see_responsavel(l.responsavel_id)
    )
  )
  WITH CHECK (
    public.is_interno()
    AND EXISTS (
      SELECT 1 FROM leads l
       WHERE l.id = diagnosticos.lead_id
         AND public.can_see_responsavel(l.responsavel_id)
    )
  );

-- ─── TAREFAS — usa atribuido_a_id ────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_all" ON tarefas;
DROP POLICY IF EXISTS "interno_all_tarefas" ON tarefas;
CREATE POLICY "interno_role_aware_tarefas" ON tarefas
  FOR ALL TO authenticated
  USING (
    public.is_interno() AND (
      atribuido_a_id IS NULL
      OR atribuido_a_id = auth.uid()
      OR public.is_diretor()
      OR public.can_see_perfil(atribuido_a_id)
    )
  )
  WITH CHECK (
    public.is_interno() AND (
      atribuido_a_id IS NULL
      OR atribuido_a_id = auth.uid()
      OR public.is_diretor()
      OR public.can_see_perfil(atribuido_a_id)
    )
  );

-- ─── INDICACOES — diretor vê tudo; demais veem só as próprias ────────────────
-- "Próprias" = onde o usuário é o indicante_perfil_id, OU é responsável pelo
-- lead resultante, OU é responsável pelo cliente/parceiro indicante.
DROP POLICY IF EXISTS "interno_all_indicacoes" ON indicacoes;
CREATE POLICY "interno_role_aware_indicacoes" ON indicacoes
  FOR ALL TO authenticated
  USING (
    public.is_interno() AND (
      public.is_diretor()
      OR indicante_perfil_id = auth.uid()
      OR (lead_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM leads l WHERE l.id = indicacoes.lead_id
          AND public.can_see_responsavel(l.responsavel_id)
      ))
      OR (indicante_cliente_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM clientes c WHERE c.id = indicacoes.indicante_cliente_id
          AND public.can_see_responsavel(c.responsavel_id)
      ))
    )
  )
  WITH CHECK (
    public.is_interno() AND (
      public.is_diretor()
      OR indicante_perfil_id = auth.uid()
      OR (lead_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM leads l WHERE l.id = indicacoes.lead_id
          AND public.can_see_responsavel(l.responsavel_id)
      ))
    )
  );
-- A policy do cliente (cliente_select_proprias_indicacoes) continua inalterada.

-- ─── PARCEIROS / AUDIT_LOGS / PERFIS — sem mudança ───────────────────────────
-- Parceiros são compartilhados; audit_logs só pra interno (já está); perfis já
-- tem a regra "id=auth.uid() OR is_interno()" que faz sentido.

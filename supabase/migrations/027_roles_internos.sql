-- Migration 027: Níveis de acesso para usuários internos
--
-- Adiciona hierarquia interna (diretor → gerente → coordenador → consultor) e
-- helpers SQL pra usar nas policies RLS (migração 029).
--
-- ⚠️ ESTA MIGRAÇÃO É APENAS ADITIVA. Nenhuma policy é alterada aqui — todos os
-- internos continuam vendo tudo como antes. A mudança de visibilidade só
-- acontece quando 029 rodar.
--
-- ⚠️ APÓS APLICAR: promover diretores e gerentes manualmente, ex.:
--     UPDATE perfis SET role = 'diretor'    WHERE email = 'fulano@consej.com';
--     UPDATE perfis SET role = 'gerente'    WHERE email = 'cicrana@consej.com';
--     UPDATE perfis SET gestor_id = (SELECT id FROM perfis WHERE email='fulano@consej.com')
--       WHERE email IN ('cicrana@consej.com', 'beltrano@consej.com');
--
-- Convenções:
--   - Default 'consultor' para todo interno existente (least privilege).
--   - Cliente continua com role NULL (não é interno).
--   - gestor_id forma cadeia 1:N (cada perfil tem 0 ou 1 gestor direto).

-- ─── 1. Colunas em perfis ─────────────────────────────────────────────────────

ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS role TEXT
    CHECK (role IS NULL OR role IN ('diretor','gerente','coordenador','consultor'));

ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS gestor_id UUID REFERENCES perfis(id) ON DELETE SET NULL;

-- Backfill: todo interno existente vira 'consultor'. Clientes ficam NULL.
UPDATE perfis SET role = 'consultor'
  WHERE tipo = 'interno' AND role IS NULL;

CREATE INDEX IF NOT EXISTS idx_perfis_role      ON perfis(role);
CREATE INDEX IF NOT EXISTS idx_perfis_gestor_id ON perfis(gestor_id);

-- ─── 2. Helpers SQL — STABLE + SECURITY DEFINER ──────────────────────────────

-- Retorna o role do usuário corrente (NULL pra cliente / sem role).
CREATE OR REPLACE FUNCTION public.current_role_consej()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM perfis WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_role_consej() TO authenticated;

-- Atalho: usuário corrente é diretor?
CREATE OR REPLACE FUNCTION public.is_diretor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'diretor')
$$;

GRANT EXECUTE ON FUNCTION public.is_diretor() TO authenticated;

-- can_see_perfil(target):
--   - sempre true se target = self
--   - true se caller é diretor
--   - true se caller é gestor (direto ou transitivo, limite 5 níveis) de target
--   - false caso contrário
-- Limite de profundidade 5 evita loop infinito e protege contra ciclos.
CREATE OR REPLACE FUNCTION public.can_see_perfil(target_id UUID)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self UUID := auth.uid();
BEGIN
  IF v_self IS NULL OR target_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_self = target_id THEN
    RETURN true;
  END IF;

  IF public.is_diretor() THEN
    RETURN true;
  END IF;

  -- Subida na cadeia de gestor a partir de target — se chegar em v_self
  -- dentro de 5 saltos, caller é gestor (transitivo) de target.
  RETURN EXISTS (
    WITH RECURSIVE cadeia AS (
      SELECT id, gestor_id, 1 AS depth FROM perfis WHERE id = target_id
      UNION ALL
      SELECT p.id, p.gestor_id, c.depth + 1
        FROM perfis p
        JOIN cadeia c ON p.id = c.gestor_id
        WHERE c.depth < 5
    )
    SELECT 1 FROM cadeia WHERE gestor_id = v_self
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_see_perfil(UUID) TO authenticated;

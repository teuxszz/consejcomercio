import { useMeuPerfil, type RoleConsej } from './usePerfis'

const ROLE_RANK: Record<RoleConsej, number> = {
  consultor:   1,
  coordenador: 2,
  gerente:     3,
  diretor:     4,
}

export interface CurrentRoleInfo {
  role: RoleConsej | null
  isLoading: boolean
  isDiretor: boolean
  isGerenteOrAcima: boolean
  isCoordenadorOrAcima: boolean
  /** Retorna true se o role do usuário atende a um dos roles exigidos. */
  hasRole: (roles: RoleConsej[]) => boolean
  /** True se role >= mínimo (hierárquico). */
  atLeast: (min: RoleConsej) => boolean
}

export function useCurrentRole(): CurrentRoleInfo {
  const { data: perfil, isLoading } = useMeuPerfil()
  const role = (perfil?.role ?? null) as RoleConsej | null

  return {
    role,
    isLoading,
    isDiretor:            role === 'diretor',
    isGerenteOrAcima:     role !== null && ROLE_RANK[role] >= ROLE_RANK.gerente,
    isCoordenadorOrAcima: role !== null && ROLE_RANK[role] >= ROLE_RANK.coordenador,
    hasRole: (roles) => role !== null && roles.includes(role),
    atLeast: (min) => role !== null && ROLE_RANK[role] >= ROLE_RANK[min],
  }
}

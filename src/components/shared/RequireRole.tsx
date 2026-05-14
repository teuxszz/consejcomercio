import type { ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import type { RoleConsej } from '@/hooks/usePerfis'

interface Props {
  /** Lista de roles permitidos. Se vazia, qualquer role autenticado passa. */
  roles?: RoleConsej[]
  /** Alternativa: role mínimo na hierarquia (diretor > gerente > coordenador > consultor). */
  atLeast?: RoleConsej
  /** Conteúdo a renderizar quando autorizado. */
  children: ReactNode
  /** Renderiza este conteúdo quando bloqueado. Default = mensagem de acesso negado. */
  fallback?: ReactNode
}

export function RequireRole({ roles, atLeast, children, fallback }: Props) {
  const { isLoading, role, hasRole, atLeast: meetsMin } = useCurrentRole()

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Verificando permissão…</div>
  }

  const allowed = roles
    ? hasRole(roles)
    : atLeast
    ? meetsMin(atLeast)
    : role !== null

  if (allowed) return <>{children}</>

  if (fallback !== undefined) return <>{fallback}</>

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
      <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-3">
        <ShieldAlert className="w-6 h-6 text-red-400" />
      </div>
      <h2 className="text-sm font-semibold text-foreground mb-1">Acesso restrito</h2>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Esta área é visível apenas para{' '}
        {roles
          ? roles.join(', ')
          : atLeast
          ? `${atLeast} ou superior`
          : 'usuários autorizados'}.
        Fale com a diretoria se precisar de acesso.
      </p>
    </div>
  )
}

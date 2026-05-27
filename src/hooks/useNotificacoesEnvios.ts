import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import type { NotificacaoEnvio } from '@/types'

/**
 * Histórico de envios dos últimos 30 dias (D-17).
 *
 * Sem `perfilId` → usa default keyset; RLS restringe automaticamente a:
 *   - próprios envios (consultor)
 *   - todos (coord+, via `is_at_least('coordenador')`)
 *
 * Com `perfilId` → filtra explícito. Útil para coord+ inspecionar outro user.
 */
export function useNotificacoesEnvios(perfilId?: string | null) {
  return useQuery<NotificacaoEnvio[]>({
    queryKey: perfilId
      ? QUERY_KEYS.notificacoesEnvios.byPerfil(perfilId)
      : QUERY_KEYS.notificacoesEnvios.all,
    queryFn: async () => {
      const dataHa30Dias = new Date(Date.now() - 30 * 86_400_000)
        .toISOString()
        .slice(0, 10)
      let q = supabase
        .from('notificacoes_envios')
        .select('*')
        .gte('dia', dataHa30Dias)
        .order('sent_at', { ascending: false })
        .limit(200)
      if (perfilId) q = q.eq('perfil_id', perfilId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as NotificacaoEnvio[]
    },
  })
}

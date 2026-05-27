import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import type { PreferenciasNotif } from '@/types'

/**
 * Carrega `perfis.preferencias_notif` JSONB (D-08).
 * Retorna `null` quando o perfil ainda não foi backfilled.
 */
export function usePreferenciasNotif(perfilId: string | null | undefined) {
  return useQuery<PreferenciasNotif | null>({
    queryKey: perfilId
      ? QUERY_KEYS.preferenciasNotif.byPerfil(perfilId)
      : QUERY_KEYS.preferenciasNotif.all,
    enabled: !!perfilId,
    queryFn: async () => {
      if (!perfilId) return null
      const { data, error } = await supabase
        .from('perfis')
        .select('preferencias_notif')
        .eq('id', perfilId)
        .maybeSingle<{ preferencias_notif: PreferenciasNotif | null }>()
      if (error) throw error
      return data?.preferencias_notif ?? null
    },
  })
}

/**
 * PATCH atômico único da coluna `preferencias_notif` (RESEARCH R5).
 * Atualiza os 4 tipos × 2 canais de uma vez — NUNCA 8 mutations separadas.
 */
export function useSalvarPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { perfilId: string; prefs: PreferenciasNotif }) => {
      const { data, error } = await supabase
        .from('perfis')
        .update({ preferencias_notif: input.prefs })
        .eq('id', input.perfilId)
        .select('id, preferencias_notif')
        .single()
      if (error) throw error
      return data as { id: string; preferencias_notif: PreferenciasNotif }
    },
    onMutate: async ({ perfilId, prefs }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEYS.preferenciasNotif.byPerfil(perfilId) })
      const previous = qc.getQueryData<PreferenciasNotif | null>(
        QUERY_KEYS.preferenciasNotif.byPerfil(perfilId),
      )
      qc.setQueryData(QUERY_KEYS.preferenciasNotif.byPerfil(perfilId), prefs)
      return { previous, perfilId }
    },
    onError: (e: unknown, _vars, ctx) => {
      if (ctx?.previous !== undefined && ctx.perfilId) {
        qc.setQueryData(
          QUERY_KEYS.preferenciasNotif.byPerfil(ctx.perfilId),
          ctx.previous,
        )
      }
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar preferências')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.preferenciasNotif.all })
      qc.invalidateQueries({ queryKey: ['perfil-meu'] })
    },
  })
}

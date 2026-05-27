import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'

/**
 * Reenvia uma notificação chamando a edge function `reenviar-notificacao`
 * (D-18). A função usa o JWT do usuário para que RLS valide quem pode
 * reenviar — consultor só próprias; coord+ pode reenviar de qualquer um.
 *
 * Toda execução cria uma nova linha em `notificacoes_envios` com
 * `reenviado_por_id` + `reenviado_em` preenchidos.
 */
export function useReenviarNotificacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (notifId: string) => {
      const { data, error } = await supabase.functions.invoke(
        'reenviar-notificacao',
        { body: { id: notifId } },
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.notificacoesEnvios.all })
      toast.success('Notificação reenviada.')
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao reenviar notificação'),
  })
}

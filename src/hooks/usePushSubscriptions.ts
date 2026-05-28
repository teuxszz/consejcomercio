import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import { subscribePush, unsubscribePush } from '@/lib/pwa'
import type { PushSubscriptionRow } from '@/types'

/**
 * Lista de subscriptions push do perfil (multi-device 1:N).
 * Filtrada por RLS: usuário vê só as suas; coord+ vê todas (migration 036).
 */
export function usePushSubscriptions(perfilId: string | null | undefined) {
  return useQuery<PushSubscriptionRow[]>({
    queryKey: perfilId
      ? QUERY_KEYS.pushSubscriptions.byPerfil(perfilId)
      : QUERY_KEYS.pushSubscriptions.all,
    enabled: !!perfilId,
    queryFn: async () => {
      if (!perfilId) return []
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('perfil_id', perfilId)
        .order('created_at', { ascending: false })
        .returns<PushSubscriptionRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Subscribe ao push manager + persiste em `push_subscriptions`.
 *
 * Pattern (D-12 + Pitfall 7):
 * 1. Lê VAPID public key de `import.meta.env.VITE_VAPID_PUBLIC_KEY`
 * 2. Chama `subscribePush(vapidKey)` do helper pwa.ts (registra no SW)
 * 3. UPSERT com `onConflict: 'perfil_id,endpoint'` — re-subscribe no mesmo device
 *    atualiza `last_seen_at` sem duplicar (UNIQUE constraint migration 036).
 *
 * **NÃO chama requestPermission** — o caller (NotificacoesPanel) cuida disso
 * para integrar com o flow de toggle e rollback (R-L5).
 */
export function useSubscribePush() {
  const qc = useQueryClient()
  return useMutation<void, Error, { perfilId: string }>({
    mutationFn: async ({ perfilId }) => {
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
      if (!vapidKey) {
        throw new Error('VAPID public key não configurada (VITE_VAPID_PUBLIC_KEY)')
      }
      const sub = await subscribePush(vapidKey)
      if (!sub) {
        throw new Error('Falha ao gerar chaves de subscription')
      }
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          perfil_id: perfilId,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          user_agent: navigator.userAgent.slice(0, 500),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'perfil_id,endpoint' },
      )
      if (error) throw error
    },
    onSuccess: (_void, { perfilId }) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.pushSubscriptions.byPerfil(perfilId) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.pushSubscriptions.all })
      toast.success('Notificações push ativadas neste device')
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Erro ao ativar push')
    },
  })
}

/**
 * Unsubscribe do browser + DELETE da row em `push_subscriptions`.
 *
 * Se `endpoint` for omitido, chama `unsubscribePush()` para descobrir do browser.
 * Se passado explicitamente (limpar row órfã), só faz o DELETE.
 */
export function useUnsubscribePush() {
  const qc = useQueryClient()
  return useMutation<void, Error, { perfilId: string; endpoint?: string }>({
    mutationFn: async ({ perfilId, endpoint: providedEndpoint }) => {
      let endpoint = providedEndpoint
      if (!endpoint) {
        const r = await unsubscribePush()
        endpoint = r?.endpoint
      }
      if (!endpoint) {
        // Sem subscription no browser e sem endpoint passado — nada a fazer
        return
      }
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('perfil_id', perfilId)
        .eq('endpoint', endpoint)
      if (error) throw error
    },
    onSuccess: (_void, { perfilId }) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.pushSubscriptions.byPerfil(perfilId) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.pushSubscriptions.all })
      toast.success('Notificações push desativadas neste device')
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Erro ao desativar push')
    },
  })
}

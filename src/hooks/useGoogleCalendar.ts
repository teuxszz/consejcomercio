import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import type { GoogleCalendarStatus } from '@/types'

// ─── Phase 999.1 Plan 05 — Conexão Google Agenda (linkIdentity) ─────────────
//
// D-01: o browser só vê `provider_refresh_token` UMA ÚNICA VEZ, imediatamente
// após o redirect do consentimento OAuth voltar para o CRM (Pitfall 2 do
// RESEARCH.md). Se essa captura falhar/for perdida, a única forma de obter um
// novo refresh_token é o assessor reconectar (linkIdentity de novo com
// prompt=consent). Por isso `useCapturarTokenGoogle` deve ser chamado
// exatamente uma vez pelo componente, gated por `?google_linked=1`.
//
// Status é sempre lido via RPC `google_calendar_status()` (nunca um SELECT
// direto na tabela — não há policy de leitura, T-999.1-01).

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export function useGoogleCalendarStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.googleCalendar.status,
    queryFn: async (): Promise<GoogleCalendarStatus> => {
      const { data, error } = await supabase.rpc('google_calendar_status')
      if (error) throw error
      // RPC retorna TABLE(conectado boolean, expira_em timestamptz) —
      // supabase-js empacota como array; normaliza para o primeiro (e único) row.
      const row = Array.isArray(data) ? data[0] : data
      return {
        conectado: Boolean(row?.conectado),
        expira_em: row?.expira_em ?? null,
      }
    },
  })
}

export function useConectarGoogleAgenda() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/me?tab=notificacoes&google_linked=1`,
          scopes: CALENDAR_SCOPE,
          queryParams: {
            access_type: 'offline', // obrigatório para receber provider_refresh_token
            prompt: 'consent',      // obrigatório para RE-emitir refresh_token em reconexões
          },
        },
      })
      if (error) throw error
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao conectar Google Agenda'),
  })
}

export function useCapturarTokenGoogle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<{ captured: boolean }> => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.provider_token || !session?.provider_refresh_token) {
        return { captured: false }
      }
      // Sem .select() — a tabela não tem policy de SELECT (returning minimal, T-999.1-01)
      const { error } = await supabase.from('google_calendar_tokens').upsert(
        {
          perfil_id: session.user.id,
          refresh_token: session.provider_refresh_token,
          access_token: session.provider_token,
          access_token_expires_at: new Date(Date.now() + 3500 * 1000).toISOString(), // ~58min
          scope: CALENDAR_SCOPE,
        },
        { onConflict: 'perfil_id' },
      )
      if (error) throw error
      return { captured: true }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.googleCalendar.status })
      if (result.captured) {
        toast.success('Google Agenda conectada!')
      } else {
        toast.error('Não foi possível confirmar a conexão. Tente reconectar.')
      }
    },
    onError: () => toast.error('Erro ao salvar a conexão com o Google Agenda. Tente reconectar.'),
  })
}

export function useDesconectarGoogleAgenda() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('google_calendar_disconnect')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.googleCalendar.status })
      toast.success('Google Agenda desconectada.')
    },
    onError: () => toast.error('Erro ao desconectar Google Agenda'),
  })
}

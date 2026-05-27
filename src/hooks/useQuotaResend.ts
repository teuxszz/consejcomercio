import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'

export interface QuotaResend {
  hoje: number
  mes: number
}

/**
 * Status corrente da quota Resend (D-15). RPC `quota_resend_atual` em
 * migration 035 retorna (hoje INT, mes INT) excluindo dropped_quota /
 * skipped_no_recipient / fallback_diretor.
 *
 * `staleTime: 60_000` evita N+1 em renders rápidos (CONTEXT discretion).
 */
export function useQuotaResend() {
  return useQuery<QuotaResend>({
    queryKey: QUERY_KEYS.quotaResend.current,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('quota_resend_atual')
      if (error) throw error
      // RPC returns TABLE(hoje int, mes int) — supabase-js gives back an array.
      const row = Array.isArray(data) ? data[0] : data
      return {
        hoje: Number(row?.hoje ?? 0),
        mes: Number(row?.mes ?? 0),
      }
    },
  })
}

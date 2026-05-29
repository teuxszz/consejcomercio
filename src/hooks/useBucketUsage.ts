import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'

// Phase 7 — Plan 04b — Banner uso de bucket (D-06).
//
// Chama RPC public.bucket_usage_bytes(p_bucket TEXT) (migration 039).
// Função é SECURITY DEFINER (lê storage.objects), GRANT EXECUTE TO authenticated.
// staleTime 5 min — uso varia devagar; evita request por render do dashboard.

export function useBucketUsage(bucket: string = 'cliente-docs') {
  return useQuery<number>({
    queryKey: QUERY_KEYS.bucketUsage.byBucket(bucket),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bucket_usage_bytes', { p_bucket: bucket })
      if (error) throw error
      return Number(data ?? 0)
    },
    staleTime: 5 * 60 * 1000,
  })
}

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import type { ClienteDoc } from '@/types'

// Phase 7 — Plan 04b — Slice Dashboard /portal-admin/aprovacoes-pendentes (D-11).
//
// RLS faz role-aware filtering automaticamente:
//   - consultor: vê só docs onde cliente.responsavel_id = auth.uid()
//   - coord+   : vê todos (via public.is_at_least('coordenador') na policy)
//
// Ordena por created_at ASC — mais antigos primeiro (mais críticos / mais perto
// de estourar o threshold dias_para_aprovacao_pendente, D-13).

export interface AprovacaoPendente extends ClienteDoc {
  cliente: {
    id: string
    nome: string
    responsavel_id: string | null
    perfil_responsavel: { nome: string } | null
  } | null
}

export function useAprovacoesPendentes() {
  return useQuery<AprovacaoPendente[]>({
    queryKey: QUERY_KEYS.aprovacoesPendentes.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente_docs')
        .select(`
          *,
          cliente:cliente_id (
            id, nome, responsavel_id,
            perfil_responsavel:perfis!responsavel_id (nome)
          )
        `)
        .eq('status', 'pending')
        .eq('requer_aprovacao', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as AprovacaoPendente[]
    },
  })
}

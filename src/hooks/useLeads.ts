import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import type { Lead, LeadLixeira } from '@/types'
import { toast } from 'sonner'

export function useLeads() {
  return useQuery({
    queryKey: QUERY_KEYS.leads.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, diagnostico:diagnosticos(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Lead[]
    },
  })
}

export function useCreateLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'diagnostico'>) => {
      const { data, error } = await supabase.from('leads').insert(input).select().single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: async (lead, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads.all })
      // If came via referral, create indicacao record
      if ((variables.origem === 'indicacao_cliente' && variables.referido_por_cliente_id) ||
          (variables.origem === 'indicacao_parceiro' && variables.referido_por_parceiro_id)) {
        await supabase.from('indicacoes').insert({
          indicante_cliente_id: variables.referido_por_cliente_id || null,
          indicante_parceiro_id: variables.referido_por_parceiro_id || null,
          indicado_nome: variables.nome,
          indicado_telefone: variables.telefone,
          indicado_empresa: variables.empresa,
          indicado_email: variables.email,
          lead_id: lead.id,
          status: 'pendente',
        })
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.indicacoes.all })
      }
      await supabase.from('audit_logs').insert({ tabela: 'leads', registro_id: lead.id, acao: 'criado', valor_depois: lead })
      toast.success('Lead criado com sucesso!')
    },
    onError: () => toast.error('Erro ao criar lead'),
  })
}

export function useUpdateLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: string }) => {
      const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads.all })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads.byId(lead.id) })
      toast.success('Lead atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar lead'),
  })
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, motivo_perda }: { id: string; status: string; motivo_perda?: string }) => {
      const updates: Record<string, unknown> = { status }
      if (motivo_perda) updates.motivo_perda = motivo_perda
      // When a deal is won, record who closed it
      if (status === 'ganho_assessoria' || status === 'ganho_consultoria') {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) updates.fechado_por_id = user.id
      }
      const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data as Lead
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.leads.all })
      const previous = queryClient.getQueryData<Lead[]>(QUERY_KEYS.leads.all)
      queryClient.setQueryData<Lead[]>(QUERY_KEYS.leads.all, old =>
        old?.map(l => l.id === id ? { ...l, status } : l) ?? []
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEYS.leads.all, ctx.previous)
      toast.error('Erro ao mover lead')
    },
    onSettled: async (lead) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads.all })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard })
      if (lead) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: perfil } = user
          ? await supabase.from('perfis').select('nome').eq('id', user.id).single()
          : { data: null }
        supabase.from('audit_logs').insert({
          tabela: 'leads',
          registro_id: lead.id,
          acao: 'status_alterado',
          campo: 'status',
          valor_depois: { status: lead.status },
          usuario: perfil?.nome ?? user?.email ?? null,
        })
      }
    },
  })
}

export function useDeleteLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('excluir_lead', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads.all })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.audit_logs.all })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads_lixeira.all })
      toast.success('Lead removido e enviado para a lixeira.')
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao remover lead'),
  })
}

export function useLeadsLixeira() {
  return useQuery({
    queryKey: QUERY_KEYS.leads_lixeira.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads_lixeira')
        .select('*')
        .is('restaurado_em', null)
        .order('excluido_em', { ascending: false })
      if (error) throw error
      return data as LeadLixeira[]
    },
  })
}

export function useRestaurarLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (lixeiraId: string) => {
      const { error } = await supabase.rpc('restaurar_lead', { p_lixeira_id: lixeiraId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads.all })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.audit_logs.all })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads_lixeira.all })
      toast.success('Lead restaurado.')
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao restaurar lead'),
  })
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import type { Objecao } from '@/types'
import { toast } from 'sonner'

export function useObjecoes() {
  return useQuery({
    queryKey: QUERY_KEYS.objecoes.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objecoes')
        .select('*')
        .order('categoria', { ascending: true })
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as Objecao[]
    },
  })
}

export function useCreateObjecao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<Objecao, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('objecoes').insert(input).select().single()
      if (error) throw error
      return data as Objecao
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.objecoes.all })
      toast.success('Objeção adicionada')
    },
    onError: (e: Error) => toast.error(`Erro ao adicionar: ${e.message}`),
  })
}

export function useUpdateObjecao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Objecao> & { id: string }) => {
      const { data, error } = await supabase
        .from('objecoes')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Objecao
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.objecoes.all })
      toast.success('Objeção atualizada')
    },
    onError: (e: Error) => toast.error(`Erro ao atualizar: ${e.message}`),
  })
}

export function useDeleteObjecao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('objecoes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.objecoes.all })
      toast.success('Objeção removida')
    },
    onError: (e: Error) => toast.error(`Erro ao remover: ${e.message}`),
  })
}

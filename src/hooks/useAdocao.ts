import { useQuery } from '@tanstack/react-query'
import { subDays, startOfMonth } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import { ACTIVE_LEAD_STAGES } from '@/lib/constants'

export function useAdocaoLogins() {
  return useQuery({
    queryKey: QUERY_KEYS.adocao.logins,
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString()
      const { data, error } = await supabase
        .from('audit_logs')
        .select('usuario, registro_id, created_at')
        .eq('acao', 'login')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export interface AtividadePerfil {
  id: string
  nome: string
  email?: string
  role?: string | null
  ultimoLogin: string | null
  leadsCriados: number
  tarefasCriadas: number
  leadsAtualizados: number
}

export function useAdocaoAtividade() {
  return useQuery({
    queryKey: QUERY_KEYS.adocao.atividade,
    queryFn: async () => {
      const mesAtual = startOfMonth(new Date()).toISOString()

      const [perfisRes, loginsRes, leadsRes, tarefasRes] = await Promise.all([
        supabase.from('perfis').select('id, nome, email, role').eq('tipo', 'interno'),
        supabase.from('audit_logs').select('registro_id, created_at').eq('acao', 'login').gte('created_at', mesAtual),
        supabase.from('leads').select('id, responsavel_id, created_at, updated_at').gte('created_at', mesAtual),
        supabase.from('tarefas').select('id, criado_por_id, created_at').gte('created_at', mesAtual),
      ])

      if (perfisRes.error) throw perfisRes.error

      const perfis = perfisRes.data ?? []
      const logins = loginsRes.data ?? []
      const leads  = leadsRes.data ?? []
      const tarefas = tarefasRes.data ?? []

      return perfis.map<AtividadePerfil>(p => {
        const meusLogins = logins.filter(l => l.registro_id === p.id)
        const ultimoLogin = meusLogins.length
          ? meusLogins.reduce((a, b) => (a.created_at > b.created_at ? a : b)).created_at
          : null
        return {
          id:              p.id,
          nome:            p.nome,
          email:           p.email,
          role:            p.role,
          ultimoLogin,
          leadsCriados:    leads.filter(l => l.responsavel_id === p.id).length,
          tarefasCriadas:  tarefas.filter(t => t.criado_por_id === p.id).length,
          leadsAtualizados: leads.filter(l => l.responsavel_id === p.id && l.updated_at >= mesAtual && l.created_at < mesAtual).length,
        }
      })
    },
  })
}

export function useLeadsEsquecidos() {
  return useQuery({
    queryKey: QUERY_KEYS.adocao.leadsEsquecidos,
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString()
      const { data, error } = await supabase
        .from('leads')
        .select('id, nome, empresa, status, updated_at, responsavel_id, responsavel')
        .in('status', ACTIVE_LEAD_STAGES as unknown as string[])
        .lt('updated_at', sevenDaysAgo)
        .order('updated_at', { ascending: true })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
  })
}

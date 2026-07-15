import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import type { Configuracoes, MetasConfig, MensagensConfig, ServicoConfig } from '@/types'
import { toast } from 'sonner'

export const DEFAULT_METAS: MetasConfig = {
  meta_leads_mes: 5,
  meta_mrr_mes: 5000,
  meta_diagnosticos_mes: 8,
  meta_reunioes_mes: 6,
  pontos_lead_criado: 5,
  pontos_proposta: 15,
  pontos_negociacao: 20,
  pontos_diagnostico: 20,
  pontos_reuniao: 15,
  pontos_ganho_assessoria: 100,
  pontos_ganho_consultoria: 60,
  pontos_indicacao: 30,
  recompensa_descricao: '',
  // Phase 999.1 D-02 — SLA de follow-up por fase. 24h default (RESEARCH A1);
  // por-fase começa vazio (Plan 06 grava os valores reais nas configurações).
  sla_followup_horas_default: 24,
  sla_followup_horas_por_stage: {},
}

export const DEFAULT_SERVICOS: ServicoConfig[] = [
  // ── Modalidades (sem área fixa — cobrem qualquer área do Direito) ─────────
  {
    id: 'assessoria_societaria',   // ID mantido para compatibilidade com dados existentes
    nome: 'Assessoria Jurídica',
    descricao: 'Suporte jurídico contínuo em qualquer área do Direito. A área de cobertura (civil, trabalhista, contratual, digital, PI etc.) é definida conforme as necessidades do cliente e registrada no contrato.',
    categoria: 'outro',
    tipo: 'complexa',
    valor: 1200,
    area_direito: undefined,       // sem área fixa — cobre todas as áreas
    segmentos_icp: ['empresa_junior', 'startup', 'empresa_senior', 'empresa_gestao', 'empresa_design', 'escritorio_arquitetura'],
    investimento_icp: ['500_2k', '2k_5k', '5k_10k'],
    cross_sells: ['revisao_contratos', 'documentacao_trabalhista', 'adequacao_lgpd', 'registro_marca'],
    up_sells: ['consultoria_empresarial'],
    ativo: true,
  },
  {
    id: 'consultoria_empresarial', // ID mantido para compatibilidade com dados existentes
    nome: 'Consultoria Jurídica',
    descricao: 'Consultoria pontual em qualquer área do Direito. O cliente apresenta uma demanda específica e definimos juntos a área de atuação, o escopo e os honorários.',
    categoria: 'outro',
    tipo: 'simples',
    valor: 800,
    area_direito: undefined,       // sem área fixa — cobre todas as áreas
    segmentos_icp: ['empresa_junior', 'startup', 'empresa_senior', 'empresa_gestao', 'empresa_design', 'escritorio_arquitetura'],
    investimento_icp: ['ate_500', '500_2k', '2k_5k', '5k_10k', 'acima_10k'],
    cross_sells: ['revisao_contratos', 'documentacao_trabalhista', 'adequacao_lgpd', 'registro_marca'],
    up_sells: ['assessoria_societaria'],
    ativo: true,
  },

  // ── Serviços específicos (área do Direito definida) ───────────────────────
  {
    id: 'acordo_socios',
    nome: 'Acordo de Sócios',
    descricao: 'Elaboração de acordo formal com regras de participação, votação, saída e resolução de conflitos entre sócios',
    categoria: 'societario',
    tipo: 'simples',
    valor: 800,
    area_direito: 'civil',
    segmentos_icp: ['empresa_junior', 'startup', 'empresa_senior'],
    investimento_icp: ['500_2k', '2k_5k'],
    cross_sells: ['assessoria_societaria'],
    up_sells: ['consultoria_empresarial'],
    ativo: true,
  },
  {
    id: 'revisao_contratos',
    nome: 'Revisão e Elaboração de Contratos',
    descricao: 'Contratos padrão para clientes, parceiros e fornecedores; revisão de cláusulas e proteção contra inadimplência',
    categoria: 'contratual',
    tipo: 'simples',
    valor: 600,
    area_direito: 'contratos',
    segmentos_icp: ['empresa_junior', 'empresa_design', 'escritorio_arquitetura', 'startup'],
    investimento_icp: ['500_2k', '2k_5k'],
    cross_sells: ['gestao_inadimplencia'],
    up_sells: ['assessoria_societaria'],
    ativo: true,
  },
  {
    id: 'gestao_inadimplencia',
    nome: 'Gestão de Inadimplência',
    descricao: 'Estruturação de processo de cobrança, notificações extrajudiciais e contratos com cláusulas anti-inadimplência',
    categoria: 'contratual',
    tipo: 'simples',
    valor: 500,
    area_direito: 'contratos',
    segmentos_icp: ['empresa_junior', 'empresa_design', 'escritorio_arquitetura'],
    investimento_icp: ['ate_500', '500_2k'],
    cross_sells: ['revisao_contratos'],
    up_sells: ['assessoria_societaria'],
    ativo: true,
  },
  {
    id: 'adequacao_lgpd',
    nome: 'Adequação LGPD',
    descricao: 'Política de Privacidade, Termos de Uso, mapeamento de dados pessoais e implementação de processos ANPD-compliant',
    categoria: 'digital',
    tipo: 'simples',
    valor: 900,
    area_direito: 'digital',
    segmentos_icp: ['startup', 'empresa_gestao', 'empresa_senior'],
    investimento_icp: ['500_2k', '2k_5k'],
    cross_sells: ['registro_marca'],
    up_sells: ['assessoria_societaria'],
    ativo: true,
  },
  {
    id: 'registro_marca',
    nome: 'Registro de Marca no INPI',
    descricao: 'Depósito e acompanhamento do processo de registro de marca junto ao INPI para proteção da identidade da empresa',
    categoria: 'pi',
    tipo: 'simples',
    valor: 800,
    area_direito: 'propriedade_intelectual',
    segmentos_icp: ['empresa_junior', 'startup', 'empresa_design', 'escritorio_arquitetura'],
    investimento_icp: ['500_2k', '2k_5k'],
    cross_sells: ['adequacao_lgpd'],
    up_sells: ['assessoria_societaria'],
    ativo: true,
  },
  {
    id: 'documentacao_trabalhista',
    nome: 'Documentação Trabalhista',
    descricao: 'Contratos de trabalho, políticas internas, acordos individuais e conformidade com CLT e legislação trabalhista vigente',
    categoria: 'trabalhista',
    tipo: 'simples',
    valor: 700,
    area_direito: 'trabalhista',
    segmentos_icp: ['startup', 'empresa_gestao', 'empresa_senior'],
    investimento_icp: ['500_2k', '2k_5k'],
    cross_sells: [],
    up_sells: ['assessoria_societaria'],
    ativo: true,
  },
]

export const DEFAULT_MENSAGENS_CONFIG: MensagensConfig = {
  defaults: {
    link_diagnostico: '',
    forma_pagamento: '',
    prazo_entrega: '',
    valor_hora: '',
    assinatura: '',
  },
  setores_ativos: ['geral', 'societario', 'contratual', 'digital_lgpd', 'trabalhista', 'marca_pi'],
  regras_voz: '',
  overrides: {},
  blocos: { overrides: {}, custom: [], ocultos: [] },
}

const DEFAULT_CONFIGURACOES: Configuracoes = {
  id: 'default',
  alerta_renovacao_dias: 60,
  servicos: DEFAULT_SERVICOS,
  metas: DEFAULT_METAS,
  updated_at: new Date().toISOString(),
}

export function useConfiguracoes() {
  return useQuery({
    queryKey: QUERY_KEYS.configuracoes,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracoes')
        .select('*')
        .eq('id', 'default')
        .single()
      if (error) {
        // Table may not exist yet — return defaults gracefully
        return DEFAULT_CONFIGURACOES
      }
      // If the DB still has the old placeholder services, replace with real defaults
      const rawServicos: ServicoConfig[] = data.servicos ?? []
      const isOldPlaceholders = rawServicos.length <= 2 &&
        rawServicos.every(s => s.id === 'simples' || s.id === 'complexa')

      if (isOldPlaceholders) {
        const mensagensEarly: MensagensConfig = {
          ...DEFAULT_MENSAGENS_CONFIG,
          ...(data.mensagens ?? {}),
          defaults: { ...DEFAULT_MENSAGENS_CONFIG.defaults, ...(data.mensagens?.defaults ?? {}) },
          overrides: data.mensagens?.overrides ?? {},
          blocos: {
            ...DEFAULT_MENSAGENS_CONFIG.blocos!,
            ...(data.mensagens?.blocos ?? {}),
            overrides: data.mensagens?.blocos?.overrides ?? {},
            custom: data.mensagens?.blocos?.custom ?? [],
            ocultos: data.mensagens?.blocos?.ocultos ?? [],
          },
        }
        return { ...data, servicos: DEFAULT_SERVICOS, mensagens: mensagensEarly } as Configuracoes
      }

      // Merge DB servicos with any new default fields (backward compat)
      const servicoDefaults = {
        descricao: '',
        categoria: 'outro' as const,
        segmentos_icp: [] as string[],
        investimento_icp: [] as string[],
        cross_sells: [] as string[],
        up_sells: [] as string[],
        ativo: true,
      }
      const dbServicos: ServicoConfig[] = rawServicos.map((s: ServicoConfig) => ({
        ...servicoDefaults,
        ...s,
      }))

      const mensagens: MensagensConfig = {
        ...DEFAULT_MENSAGENS_CONFIG,
        ...(data.mensagens ?? {}),
        defaults: { ...DEFAULT_MENSAGENS_CONFIG.defaults, ...(data.mensagens?.defaults ?? {}) },
        overrides: data.mensagens?.overrides ?? {},
      }

      return { ...data, servicos: dbServicos, mensagens } as Configuracoes
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useUpdateConfiguracoes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: Partial<Omit<Configuracoes, 'id' | 'updated_at'>>) => {
      const { data, error } = await supabase
        .from('configuracoes')
        .upsert({ id: 'default', ...updates, updated_at: new Date().toISOString() })
        .select()
        .single()
      if (error) throw error
      return data as Configuracoes
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.configuracoes })
      toast.success('Configurações salvas!')
    },
    onError: () => toast.error('Erro ao salvar configurações'),
  })
}

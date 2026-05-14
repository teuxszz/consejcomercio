// Pipeline stages — passive intake only (no active prospecting)
export const PIPELINE_STAGES = [
  { id: 'classificacao',             label: 'Classificação',              color: 'sky'     },
  { id: 'levantamento_oportunidade', label: 'Levantamento de Oportunidade', color: 'blue'   },
  { id: 'educar_lead',               label: 'Educar o Lead',              color: 'violet'  },
  { id: 'proposta_comercial',        label: 'Proposta Comercial',         color: 'amber'   },
  { id: 'negociacao',                label: 'Negociação',                 color: 'orange'  },
  { id: 'stand_by',                  label: 'Stand By',                   color: 'slate'   },
  { id: 'ganho_assessoria',          label: 'Ganho – Assessoria',         color: 'green'   },
  { id: 'ganho_consultoria',         label: 'Ganho – Consultoria',        color: 'emerald' },
  { id: 'perdido',                   label: 'Perdido',                    color: 'red'     },
  { id: 'cancelado',                 label: 'Cancelado',                  color: 'rose'    },
] as const

export type PipelineStageId = typeof PIPELINE_STAGES[number]['id']

// Stages that represent a closed deal (won)
export const TERMINAL_WON_STAGES = ['ganho_assessoria', 'ganho_consultoria'] as const
// Stages that represent a closed deal (lost)
export const TERMINAL_LOST_STAGES = ['perdido', 'cancelado'] as const
// All terminal stages (hidden in kanban by default)
export const TERMINAL_STAGES = [...TERMINAL_WON_STAGES, ...TERMINAL_LOST_STAGES] as const

// Active pipeline stages — leads in motion (excludes terminal AND stand_by).
// Used for "Leads Ativos" KPI on the dashboard: leads ganhos, perdidos e em stand_by
// não entram nesse cálculo (decisão da diretoria CONSEJ — 2026).
export const ACTIVE_LEAD_STAGES = PIPELINE_STAGES
  .filter(s => !(TERMINAL_STAGES as readonly string[]).includes(s.id) && s.id !== 'stand_by')
  .map(s => s.id) as readonly string[]

export const STAGE_COLORS: Record<string, string> = {
  classificacao:             'bg-sky-100 text-sky-700 border-sky-200',
  levantamento_oportunidade: 'bg-blue-100 text-blue-700 border-blue-200',
  educar_lead:               'bg-violet-100 text-violet-700 border-violet-200',
  proposta_comercial:        'bg-amber-100 text-amber-700 border-amber-200',
  negociacao:                'bg-orange-100 text-orange-700 border-orange-200',
  stand_by:                  'bg-[rgba(255,255,255,0.06)] text-muted-foreground border-[rgba(255,255,255,0.10)]',
  ganho_assessoria:          'bg-green-100 text-green-700 border-green-200',
  ganho_consultoria:         'bg-emerald-100 text-emerald-700 border-emerald-200',
  perdido:                   'bg-red-100 text-red-700 border-red-200',
  cancelado:                 'bg-rose-100 text-rose-700 border-rose-200',
}

export const STAGE_BORDER_COLORS: Record<string, string> = {
  classificacao:             'border-l-sky-400',
  levantamento_oportunidade: 'border-l-blue-500',
  educar_lead:               'border-l-violet-500',
  proposta_comercial:        'border-l-amber-500',
  negociacao:                'border-l-orange-500',
  stand_by:                  'border-l-slate-400',
  ganho_assessoria:          'border-l-green-500',
  ganho_consultoria:         'border-l-emerald-500',
  perdido:                   'border-l-red-500',
  cancelado:                 'border-l-rose-500',
}

// Lead origins — passive only
export const LEAD_SOURCES = [
  { value: 'indicacao_cliente', label: 'Indicação de Cliente' },
  { value: 'indicacao_parceiro', label: 'Indicação de Parceiro' },
  { value: 'evento', label: 'Evento / Workshop' },
  { value: 'redes_sociais', label: 'Redes Sociais (orgânico)' },
  { value: 'site', label: 'Site (inbound)' },
  { value: 'mej', label: 'Rede MEJ' },
  { value: 'outro', label: 'Outro' },
]

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  indicacao_cliente: 'Indicação de Cliente',
  indicacao_parceiro: 'Indicação de Parceiro',
  evento: 'Evento',
  redes_sociais: 'Redes Sociais',
  site: 'Site',
  mej: 'MEJ',
  outro: 'Outro',
}

// Client segments
export const SEGMENTS = [
  { value: 'empresa_junior', label: 'Empresa Júnior (MEJ)' },
  { value: 'empresa_senior', label: 'Empresa Sênior' },
  { value: 'startup', label: 'Startup' },
  { value: 'escritorio_arquitetura', label: 'Escritório de Arquitetura' },
  { value: 'empresa_design', label: 'Empresa de Design' },
  { value: 'empresa_gestao', label: 'Empresa de Gestão / Compliance' },
  { value: 'outro', label: 'Outro' },
]

// Service areas
export const SERVICE_AREAS = [
  { value: 'civil', label: 'Direito Civil' },
  { value: 'empresarial', label: 'Direito Empresarial' },
  { value: 'contratos', label: 'Direito Contratual' },
  { value: 'digital', label: 'Direito Digital / LGPD' },
  { value: 'trabalhista', label: 'Direito Trabalhista' },
  { value: 'propriedade_intelectual', label: 'Propriedade Intelectual / RM' },
  { value: 'estatuto', label: 'Revisão Estatutária' },
  { value: 'gestao_contratual', label: 'Gestão Contratual' },
]

// Pricing models
export const PRICING_MODELS = [
  { value: 'assessoria_6m', label: 'Assessoria 6 meses' },
  { value: 'assessoria_8m', label: 'Assessoria 8 meses' },
  { value: 'assessoria_12m', label: 'Assessoria 12 meses' },
  { value: 'consultoria_pontual', label: 'Consultoria Pontual' },
  { value: 'resgate', label: 'Assessoria por Resgate' },
]

// Contract types
export const CONTRACT_TYPES = [
  { value: 'assessoria', label: 'Assessoria Jurídica' },
  { value: 'consultoria', label: 'Consultoria Jurídica' },
  { value: 'resgate', label: 'Assessoria por Resgate' },
]

// Demanda types with auto-prices
export const DEMANDA_TIPOS = [
  { value: 'simples', label: 'Simples', valor: 200 },
  { value: 'complexa', label: 'Complexa', valor: 500 },
]

// Partner types (IPP — Perfil Ideal dos Parceiros)
export const PARCEIRO_TIPOS = [
  { value: 'empresa_junior', label: 'Empresa Júnior' },
  { value: 'escritorio_advocacia', label: 'Escritório de Advocacia' },
  { value: 'startup', label: 'Startup' },
  { value: 'empresa_design', label: 'Empresa de Design' },
  { value: 'empresa_gestao', label: 'Empresa de Gestão' },
  { value: 'arquiteto_senior', label: 'Arquiteto Sênior' },
  { value: 'outro', label: 'Outro' },
]

// Reward types (Clube de Parceiros CONSEJ)
export const REWARD_TYPES = [
  { value: 'desconto_contrato', label: 'Desconto no Contrato' },
  { value: 'presente_especial', label: 'Presente Especial' },
  { value: 'nenhuma', label: 'Sem recompensa' },
]

// Indicacao status
export const INDICACAO_STATUS = [
  { value: 'pendente', label: 'Pendente', color: 'bg-[rgba(255,255,255,0.06)] text-muted-foreground' },
  { value: 'contactado', label: 'Contactado', color: 'bg-blue-100 text-blue-700' },
  { value: 'em_negociacao', label: 'Em Negociação', color: 'bg-amber-100 text-amber-700' },
  { value: 'convertido', label: 'Convertido', color: 'bg-green-100 text-green-700' },
  { value: 'perdido', label: 'Perdido', color: 'bg-red-100 text-red-700' },
]

// Client status
export const CLIENT_STATUS_OPTIONS = [
  { value: 'ativo', label: 'Ativo', color: 'bg-green-100 text-green-700' },
  { value: 'em_renovacao', label: 'Em Renovação', color: 'bg-amber-100 text-amber-700' },
  { value: 'encerrado', label: 'Encerrado', color: 'bg-[rgba(255,255,255,0.06)] text-muted-foreground' },
]

// RM status
export const RM_STATUS_OPTIONS = [
  { value: 'verificar', label: 'Verificar', color: 'text-red-400 bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.25)]' },
  { value: 'possivel', label: 'Possível', color: 'text-green-700 bg-green-50 border-green-200' },
  { value: 'em_andamento', label: 'Em Andamento', color: 'text-amber-400 bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.25)]' },
  { value: 'registrado', label: 'Registrado', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { value: 'nao_aplicavel', label: 'Não se aplica', color: 'text-[rgba(150,165,180,0.65)] bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)]' },
]

// Oportunidade types
export const OPORTUNIDADE_TIPOS = [
  { value: 'upsell', label: 'Upsell' },
  { value: 'cross_sell', label: 'Cross-sell' },
  { value: 'renovacao', label: 'Renovação' },
]

export const OPORTUNIDADE_STATUS = [
  { value: 'identificada', label: 'Identificada', color: 'bg-[rgba(255,255,255,0.06)] text-muted-foreground' },
  { value: 'abordada', label: 'Abordada', color: 'bg-blue-100 text-blue-700' },
  { value: 'em_proposta', label: 'Em Proposta', color: 'bg-amber-100 text-amber-700' },
  { value: 'convertida', label: 'Convertida', color: 'bg-green-100 text-green-700' },
  { value: 'descartada', label: 'Descartada', color: 'bg-red-100 text-red-700' },
]

// Budget options (from diagnostic)
export const BUDGET_OPTIONS = [
  { value: 'ate_500', label: 'Até R$500' },
  { value: '500_2k', label: 'R$500 – R$2.000' },
  { value: '2k_5k', label: 'R$2.000 – R$5.000' },
  { value: '5k_10k', label: 'R$5.000 – R$10.000' },
  { value: 'acima_10k', label: 'Acima de R$10.000' },
]

// Brazilian states (UF codes)
export const ESTADOS_BR = [
  { uf: 'AC', nome: 'Acre' },
  { uf: 'AL', nome: 'Alagoas' },
  { uf: 'AP', nome: 'Amapá' },
  { uf: 'AM', nome: 'Amazonas' },
  { uf: 'BA', nome: 'Bahia' },
  { uf: 'CE', nome: 'Ceará' },
  { uf: 'DF', nome: 'Distrito Federal' },
  { uf: 'ES', nome: 'Espírito Santo' },
  { uf: 'GO', nome: 'Goiás' },
  { uf: 'MA', nome: 'Maranhão' },
  { uf: 'MT', nome: 'Mato Grosso' },
  { uf: 'MS', nome: 'Mato Grosso do Sul' },
  { uf: 'MG', nome: 'Minas Gerais' },
  { uf: 'PA', nome: 'Pará' },
  { uf: 'PB', nome: 'Paraíba' },
  { uf: 'PR', nome: 'Paraná' },
  { uf: 'PE', nome: 'Pernambuco' },
  { uf: 'PI', nome: 'Piauí' },
  { uf: 'RJ', nome: 'Rio de Janeiro' },
  { uf: 'RN', nome: 'Rio Grande do Norte' },
  { uf: 'RS', nome: 'Rio Grande do Sul' },
  { uf: 'RO', nome: 'Rondônia' },
  { uf: 'RR', nome: 'Roraima' },
  { uf: 'SC', nome: 'Santa Catarina' },
  { uf: 'SP', nome: 'São Paulo' },
  { uf: 'SE', nome: 'Sergipe' },
  { uf: 'TO', nome: 'Tocantins' },
]

// Objection matrix categories
export const OBJECAO_CATEGORIAS = [
  { value: 'preco',         label: 'Preço',          color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'tempo',         label: 'Tempo / Timing', color: 'bg-blue-100 text-blue-700 border-blue-200'    },
  { value: 'autoridade',    label: 'Autoridade',     color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'concorrencia',  label: 'Concorrência',   color: 'bg-rose-100 text-rose-700 border-rose-200'    },
  { value: 'necessidade',   label: 'Necessidade',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'confianca',     label: 'Confiança',      color: 'bg-cyan-100 text-cyan-700 border-cyan-200'    },
  { value: 'outro',         label: 'Outro',          color: 'bg-[rgba(255,255,255,0.06)] text-muted-foreground border-[rgba(255,255,255,0.10)]' },
]

// Clusters (from existing consej-crm)
export const CLUSTERS = [
  { value: '1-2', label: 'Cluster 1-2 (Governança)' },
  { value: '3-4', label: 'Cluster 3-4 (Contratos)' },
  { value: '5', label: 'Cluster 5 (Assessoria Completa)' },
  { value: 'resgate', label: 'Assessoria por Resgate' },
]

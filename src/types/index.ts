export interface Lead {
  id: string
  nome: string
  empresa: string
  segmento: string
  telefone: string
  email?: string | null
  origem: string
  status: string
  estado?: string | null
  data_diagnostico?: string | null
  motivo_perda?: string | null
  servicos_interesse?: string[]
  investimento_estimado?: string | null
  responsavel?: string | null
  responsavel_id?: string | null
  fechado_por_id?: string | null
  referido_por_cliente_id?: string | null
  referido_por_parceiro_id?: string | null
  notas?: string | null
  created_at: string
  updated_at: string
  diagnostico?: Diagnostico | null
}

export interface DiagnosticAnswers {
  civil_q1?: string
  civil_q2?: string
  civil_q3?: string
  empresarial_q1?: string
  empresarial_q2?: string
  contratual_q1?: string
  contratual_q2?: string
  contratual_q3?: string
  digital_q1?: string
  trabalhista_q1?: string
  trabalhista_q2?: string
  pi_q1?: string
  investimento_q1?: string
}

export interface Diagnostico extends DiagnosticAnswers {
  id: string
  lead_id: string
  cluster_recomendado?: string | null
  servicos_urgentes?: string[]
  completed_at?: string | null
  created_at: string
  updated_at: string
}

export interface Cliente {
  id: string
  lead_id?: string | null
  nome: string
  empresa: string
  segmento: string
  telefone?: string | null
  email?: string | null
  status: string
  estado?: string | null
  notas?: string | null
  nps_score?: number | null
  nps_updated_at?: string | null
  indicado_por_cliente_id?: string | null
  created_at: string
  updated_at: string
  contratos?: Contrato[]
  indicado_por_cliente?: Pick<Cliente, 'id' | 'nome' | 'empresa'> | null
}

export interface Contrato {
  id: string
  cliente_id: string
  tipo: string
  modelo_precificacao: string
  areas_direito: string[]
  valor_total?: number | null
  valor_mensal?: number | null
  data_inicio?: string | null
  data_fim?: string | null
  status: string
  rm_status: string
  notas?: string | null
  observacoes_demanda?: string | null
  observacoes_vp?: string | null
  responsavel_id?: string | null
  caso_manifesto?: boolean
  caso_manifesto_descricao?: string | null
  valor_protegido?: number | null
  created_at: string
  updated_at: string
  cliente?: Cliente
}

export interface PosJunior {
  id: string
  nome: string
  email?: string | null
  telefone?: string | null
  empresa?: string | null
  cargo?: string | null
  area_atuacao?: string | null
  anos_consej?: number | null
  semestre_saida?: string | null
  disponivel_mentoria: boolean
  linkedin?: string | null
  notas?: string | null
  created_at: string
}

export interface Demanda {
  id: string
  contrato_id: string
  cliente_id: string
  titulo: string
  descricao?: string | null
  tipo: string
  valor?: number | null
  status: string
  area_direito?: string | null
  data_abertura: string
  data_conclusao?: string | null
  responsavel?: string | null
  created_at: string
  updated_at: string
  contrato?: Contrato
  cliente?: Cliente
}

export interface Parceiro {
  id: string
  nome: string
  tipo: string
  contato_nome?: string | null
  contato_email?: string | null
  contato_phone?: string | null
  website?: string | null
  status: string
  notas?: string | null
  created_at: string
  updated_at: string
}

export interface Indicacao {
  id: string
  indicante_cliente_id?: string | null
  indicante_parceiro_id?: string | null
  indicante_perfil_id?: string | null
  indicado_nome: string
  indicado_telefone: string
  indicado_empresa?: string | null
  indicado_email?: string | null
  lead_id?: string | null
  status: string
  tipo_recompensa?: string | null
  recompensa_descricao?: string | null
  recompensa_entregue: boolean
  data_recompensa?: string | null
  notas?: string | null
  created_at: string
  updated_at: string
  indicante_cliente?: Cliente | null
  indicante_parceiro?: Parceiro | null
  lead?: Lead | null
}

export interface Oportunidade {
  id: string
  cliente_id: string
  contrato_id?: string | null
  tipo: string
  servico_alvo: string
  titulo: string
  descricao?: string | null
  status: string
  valor_estimado?: number | null
  data_alerta?: string | null
  responsavel?: string | null
  created_at: string
  updated_at: string
  cliente?: Cliente
}

export type ServicoCategoria = 'societario' | 'contratual' | 'digital' | 'trabalhista' | 'pi' | 'outro'

export interface ServicoConfig {
  id: string                    // slug único: 'registro_marca', 'assessoria_societaria'
  nome: string
  descricao: string             // descrição de uma linha do serviço
  categoria: ServicoCategoria
  tipo: 'simples' | 'complexa'
  valor: number
  area_direito?: string         // mapeia para SERVICE_AREAS.value

  // ICP — Ideal Client Profile
  segmentos_icp: string[]       // SEGMENTS.value[] que mais se encaixam
  investimento_icp: string[]    // BUDGET_OPTIONS.value[] compatíveis

  // Cross-sell / Up-sell
  cross_sells: string[]         // IDs de ServicoConfig que combinam bem
  up_sells: string[]            // IDs de ServicoConfig que são upgrades

  ativo: boolean
}

export interface MetasConfig {
  meta_leads_mes: number
  meta_mrr_mes: number
  meta_diagnosticos_mes: number
  meta_reunioes_mes: number
  pontos_lead_criado: number
  pontos_proposta: number
  pontos_negociacao: number
  pontos_diagnostico: number
  pontos_reuniao: number
  pontos_ganho_assessoria: number
  pontos_ganho_consultoria: number
  pontos_indicacao: number
  recompensa_descricao: string
}

export interface MensagensConfig {
  defaults: {
    link_diagnostico: string
    forma_pagamento: string
    prazo_entrega: string
    valor_hora: string
    assinatura: string
  }
  setores_ativos: string[]
  regras_voz: string
  overrides: Record<string, { body: string; subject?: string }>
  blocos?: {
    overrides: Record<string, { titulo?: string; texto?: string; setores?: string[] }>
    custom: Array<{ id: string; categoria: string; titulo: string; texto: string; setores?: string[] }>
    ocultos: string[]
  }
}

export interface Configuracoes {
  id: string
  alerta_renovacao_dias: number
  servicos: ServicoConfig[]
  metas?: MetasConfig
  mensagens?: MensagensConfig
  updated_at: string
}

export type TarefaTipo =
  | 'generica'
  | 'followup'
  | 'reuniao_prep'
  | 'renovacao'
  | 'upsell'
  | 'diagnostico'
  | 'proposta'
  | 'cobranca'

export type TarefaPrioridade = 'baixa' | 'media' | 'alta' | 'critica'

export type TarefaStatus = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada'

export type TarefaEntidade = 'lead' | 'cliente' | 'contrato' | 'oportunidade' | 'reuniao' | 'indicacao'

export interface Tarefa {
  id: string
  titulo: string
  descricao?: string | null
  tipo: TarefaTipo
  entidade_tipo?: TarefaEntidade | null
  entidade_id?: string | null
  atribuido_a_id?: string | null
  criado_por_id?: string | null
  prioridade: TarefaPrioridade
  status: TarefaStatus
  data_vencimento?: string | null
  data_conclusao?: string | null
  notas?: string | null
  notificar?: boolean
  created_at: string
  updated_at: string
}

export interface InteracaoLead {
  id: string
  lead_id: string
  canal: 'whatsapp' | 'email' | 'linkedin'
  stage_msg: string
  setor: string
  variacao_idx: number
  assunto?: string | null
  corpo: string
  telefone_usado?: string | null
  pipeline_antes?: string | null
  pipeline_depois?: string | null
  enviada_por_id?: string | null
  enviada_por?: string | null
  enviada_em: string
  created_at: string
}

export interface AuditLog {
  id: string
  tabela: string
  registro_id: string
  acao: string
  campo?: string | null
  valor_antes?: Record<string, unknown> | null
  valor_depois?: Record<string, unknown> | null
  usuario?: string | null
  created_at: string
}

export interface LeadLixeira {
  id: string
  lead_id: string
  lead_nome?: string | null
  lead_empresa?: string | null
  snapshot: Record<string, unknown>
  excluido_por?: string | null
  excluido_por_nome?: string | null
  excluido_em: string
  restaurado_em?: string | null
  restaurado_por?: string | null
}

// ─── Portal de Indicações — Tokens ───────────────────────────────────────────

export interface TokenTransacao {
  id: string
  perfil_id: string
  tipo: 'credito' | 'debito'
  motivo: string
  valor: number
  referencia_tipo?: string | null
  referencia_id?: string | null
  descricao?: string | null
  created_at: string
}

export interface CatalogoRecompensa {
  id: string
  nome: string
  descricao?: string | null
  tier: 'cortesia' | 'desconto' | 'servico' | 'premium'
  custo_tokens: number
  aprovacao_dupla: boolean
  ativo: boolean
  created_at: string
}

export interface Resgate {
  id: string
  perfil_id: string
  catalogo_id: string
  tokens_debitados: number
  status: 'pendente' | 'aprovado' | 'entregue' | 'cancelado'
  aprovado_por_id?: string | null
  notas?: string | null
  created_at: string
  updated_at: string
  catalogo?: CatalogoRecompensa
}

export interface RegraToken {
  id: string
  motivo: string
  label: string
  descricao?: string | null
  valor_tokens: number
  ativo: boolean
  ordem: number
  created_at: string
  updated_at: string
}

export interface Campanha {
  id: string
  titulo: string
  descricao: string
  cor: string
  icone: string
  data_inicio: string
  data_fim: string
  ativa: boolean
  destaque: boolean
  created_at: string
  updated_at: string
}

export type ObjecaoCategoria =
  | 'preco'
  | 'tempo'
  | 'autoridade'
  | 'concorrencia'
  | 'necessidade'
  | 'confianca'
  | 'outro'

export interface Objecao {
  id: string
  categoria: ObjecaoCategoria | string
  objecao: string
  resposta_sugerida: string
  tags?: string[]
  origem_lead_id?: string | null
  criado_por_id?: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export type NivelToken = 'bronze' | 'prata' | 'ouro' | 'diamante'

export function calcularNivel(historicoTotal: number): NivelToken {
  if (historicoTotal >= 15000) return 'diamante'
  if (historicoTotal >= 5000)  return 'ouro'
  if (historicoTotal >= 1000)  return 'prata'
  return 'bronze'
}

export const NIVEL_CONFIG: Record<NivelToken, { label: string; cor: string; bonus: number; min: number; next: number }> = {
  bronze:   { label: 'Bronze',   cor: '#cd7f32', bonus: 0,  min: 0,     next: 1000  },
  prata:    { label: 'Prata',    cor: '#9ca3af', bonus: 10, min: 1000,  next: 5000  },
  ouro:     { label: 'Ouro',     cor: '#f59e0b', bonus: 20, min: 5000,  next: 15000 },
  diamante: { label: 'Diamante', cor: '#818cf8', bonus: 30, min: 15000, next: 15000 },
}

// ─── Phase 5 — Multi-Channel Notifications (Email + Slack) ──────────────────
// ─── Phase 6 — PWA + Push (D-16: 'push' added to CanalNotif/PreferenciasNotif)

export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'
export type CanalNotif = 'email' | 'slack' | 'push'
export type StatusNotif =
  | 'queued'
  | 'delivered'
  | 'opened'
  | 'bounced'
  | 'complained'
  | 'dropped_quota'
  | 'skipped_no_recipient'
  | 'fallback_diretor'
  | 'failed'

export interface PreferenciasNotif {
  // Ordem `slack | email | push` alinha com a matriz UI (Plan 04 — 4×3)
  tarefa:    { slack: boolean; email: boolean; push: boolean }
  cadencia:  { slack: boolean; email: boolean; push: boolean }
  renovacao: { slack: boolean; email: boolean; push: boolean }
  indicacao: { slack: boolean; email: boolean; push: boolean }
}

/** Row da tabela push_subscriptions (Phase 6 migration 036).
 * Nome com sufixo Row pra não colidir com tipo nativo do DOM PushSubscription. */
export interface PushSubscriptionRow {
  id: string
  perfil_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  last_seen_at: string
  created_at: string
}

export interface NotificacaoEnvio {
  id: string
  perfil_id: string
  tipo: TipoNotif
  entidade_id: string | null
  entidade_tipo: 'lead' | 'cliente' | 'contrato' | 'tarefa' | null
  canal: CanalNotif
  subject: string | null
  status: StatusNotif
  resend_id: string | null
  slack_ts: string | null
  error_msg: string | null
  sent_at: string
  delivered_at: string | null
  opened_at: string | null
  bounced_at: string | null
  complained_at: string | null
  reenviado_por_id: string | null
  reenviado_em: string | null
  dia: string
}

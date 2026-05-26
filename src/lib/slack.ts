import { supabase } from '@/lib/supabase'

export interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  num_members: number
  topic?: { value: string }
}

export interface SlackMessage {
  ts: string
  user: string
  text: string
  reactions?: { name: string; count: number }[]
  reply_count?: number
  subtype?: string
}

async function callProxy(body: object) {
  const { data, error } = await supabase.functions.invoke('slack-proxy', { body })
  if (error) throw new Error(error.message ?? 'Erro ao chamar slack-proxy')
  if (!data?.ok) throw new Error(data?.error ?? 'Erro desconhecido do Slack')
  return data
}

export async function listChannels(): Promise<SlackChannel[]> {
  const data = await callProxy({ action: 'list_channels' })
  return (data.channels ?? []) as SlackChannel[]
}

export async function getMessages(channel: string, limit = 30): Promise<SlackMessage[]> {
  const data = await callProxy({ action: 'get_messages', channel, limit })
  return (data.messages ?? []) as SlackMessage[]
}

export async function getUserName(userId: string): Promise<string> {
  try {
    const data = await callProxy({ action: 'get_user', channel: userId })
    return data.user?.real_name ?? data.user?.name ?? userId
  } catch {
    return userId
  }
}

export function tsToDate(ts: string): Date {
  return new Date(parseFloat(ts) * 1000)
}

export function formatSlackText(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, '@usuário')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<([^>]+)>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// ─── Message classification ───────────────────────────────────────────────────

export type MessageClassification = 'reuniao' | 'lead' | 'oportunidade' | 'indicacao' | 'demanda' | 'contrato'

// Ordered by priority — first match wins
const CLASSIFY_MAP: [MessageClassification, RegExp][] = [
  ['reuniao',
    /\b(reunião|reuniao|meeting|call|ligação|ligacao|videoconferência|videochamada|zoom|google meet|teams|calendly|agendado para|confirmado para|às \d{1,2}h|remarcado)\b/i],
  ['indicacao',
    /\b(indicou|foi indicado|veio por indicação|indicação de|indicou o|indicou a|recomendou|trouxe um contato|me mandou contato|indicou para nós|indicado pelo|indicada pela)\b/i],
  ['lead',
    /\b(novo contato|novo lead|novo cliente|conheci|prospecção|prospectei|interessado em|quer contratar|quer fazer (um|uma)|procurando advogado|precisa de (advogado|assessoria|consultoria)|busca(ndo)? (advogado|assessoria|consultoria)|potencial cliente|primeira consulta|diagnóstico gratuito|me indicaram|ele quer contratar|ela quer contratar|entrou em contato|fez contato|assumir o contato|assumir o lead|contato com o lead|registro de marca|processo (trabalhista|civil|criminal)|inventário|divórcio|assessoria jurídica|consultoria jurídica|cliente em potencial|para fazer (um|uma)|para contratar|pode assumir|pode atender|quem (pode|vai) (assumir|atender))\b/i],
  ['demanda',
    /\b(demanda|solicitação do cliente|pedido do cliente|cliente pediu|cliente solicitou|prazo urgente|atividade pendente|tarefa para o cliente|entrega de (contrato|documento|parecer)|precisam de nós)\b/i],
  ['oportunidade',
    /\b(proposta|orçamento|orcamento|negociação|negociando|honorários|honorarios|fechar contrato|prestes a assinar|pipeline|follow.?up de proposta|R\$\s*\d)\b/i],
  ['contrato',
    /\b(contrato assinado|assinou o contrato|contrato fechado|enviamos o contrato|contrato enviado|renovação de contrato|renovacao|vencimento do contrato|vigência|vigencia)\b/i],
]

export function classifyMessage(text: string): MessageClassification | null {
  for (const [type, pattern] of CLASSIFY_MAP) {
    if (pattern.test(text)) return type
  }
  return null
}

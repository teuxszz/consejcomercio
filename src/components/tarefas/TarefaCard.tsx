import { useNavigate } from 'react-router-dom'
import {
  Circle, ExternalLink, Pencil, Trash2, Calendar,
  MessageCircle, Users, Briefcase, FileText, Handshake, Target, Send,
} from 'lucide-react'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { TarefaStatusBadge } from './TarefaStatusBadge'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Tarefa, TarefaPrioridade, TarefaTipo } from '@/types'

const TIPO_ICONS: Record<TarefaTipo, typeof Target> = {
  generica:     Target,
  followup:     MessageCircle,
  reuniao_prep: Calendar,
  renovacao:    FileText,
  upsell:       Briefcase,
  diagnostico:  Users,
  proposta:     Handshake,
  cobranca:     Send,
}

const PRIORIDADE_LABEL: Record<TarefaPrioridade, string> = {
  critica: 'Crítica',
  alta:    'Alta',
  media:   'Média',
  baixa:   'Baixa',
}

const PRIORIDADE_STYLE: Record<TarefaPrioridade, { bg: string; color: string; border: string }> = {
  critica: { bg: 'rgba(239,68,68,0.12)',  color: '#fca5a5', border: 'rgba(239,68,68,0.30)'  },
  alta:    { bg: 'rgba(249,115,22,0.12)', color: '#fdba74', border: 'rgba(249,115,22,0.30)' },
  media:   { bg: 'rgba(0,137,172,0.12)',  color: '#6bd0e7', border: 'rgba(0,137,172,0.30)'  },
  baixa:   { bg: 'var(--alpha-bg-sm)',    color: 'var(--text-soft-a)', border: 'var(--alpha-border)' },
}

function entityLink(tipo: string, id: string): string | null {
  if (tipo === 'lead')         return `/leads/${id}`
  if (tipo === 'cliente')      return `/clientes/${id}`
  if (tipo === 'contrato')     return '/contratos'
  if (tipo === 'oportunidade') return '/oportunidades'
  if (tipo === 'reuniao')      return '/reunioes'
  if (tipo === 'indicacao')    return '/indicacoes'
  return null
}

type Props = {
  tarefa: Tarefa
  userId: string
  onConcluir: (id: string) => void
  onEditar: (t: Tarefa) => void
  onRemover: (id: string) => void
}

export function TarefaCard({ tarefa, userId, onConcluir, onEditar, onRemover }: Props) {
  const navigate = useNavigate()
  const { isCoordenadorOrAcima } = useCurrentRole()

  const canManage = tarefa.criado_por_id === userId || tarefa.atribuido_a_id === userId || isCoordenadorOrAcima
  const vencida = tarefa.data_vencimento ? new Date(tarefa.data_vencimento) < new Date() : false
  const Icon = TIPO_ICONS[tarefa.tipo] ?? Target
  const prioStyle = PRIORIDADE_STYLE[tarefa.prioridade]
  const link = tarefa.entidade_tipo && tarefa.entidade_id
    ? entityLink(tarefa.entidade_tipo, tarefa.entidade_id)
    : null

  return (
    <div className={cn('px-4 py-3 flex items-start gap-3 hover:bg-[var(--alpha-bg-xs)] transition-colors group')}>
      <button
        type="button"
        title="Concluir"
        onClick={() => onConcluir(tarefa.id)}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-[#10b981]"
      >
        <Circle className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-fg2 truncate">{tarefa.titulo}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border"
            style={{ background: prioStyle.bg, color: prioStyle.color, borderColor: prioStyle.border }}
          >
            {PRIORIDADE_LABEL[tarefa.prioridade]}
          </span>
          <TarefaStatusBadge status={tarefa.status} />
        </div>
        {tarefa.descricao && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tarefa.descricao}</p>
        )}
        {tarefa.data_vencimento && (
          <p className={cn('text-[11px] mt-1 inline-flex items-center gap-1', vencida ? 'text-[#fca5a5]' : 'text-fg4')}>
            <Calendar className="w-3 h-3" />
            {vencida ? 'Venceu ' : 'Vence '}
            {formatDate(tarefa.data_vencimento)}
          </p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {link && (
          <button
            type="button"
            onClick={() => navigate(link)}
            title="Abrir"
            className="p-1.5 rounded hover:bg-[var(--alpha-bg-sm)] text-muted-foreground hover:text-fg2 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
        {canManage && (
          <>
            <button
              type="button"
              onClick={() => onEditar(tarefa)}
              title="Editar"
              className="p-1.5 rounded hover:bg-[var(--alpha-bg-sm)] text-muted-foreground hover:text-fg2 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRemover(tarefa.id)}
              title="Remover"
              className="p-1.5 rounded hover:bg-[rgba(239,68,68,0.10)] text-muted-foreground hover:text-[#fca5a5] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

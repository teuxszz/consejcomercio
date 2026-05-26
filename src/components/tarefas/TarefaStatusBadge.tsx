import type { TarefaStatus } from '@/types'

const STATUS_STYLE: Record<TarefaStatus, { bg: string; color: string; border: string; label: string }> = {
  aberta:       { bg: 'rgba(251,191,36,0.12)',  color: 'var(--amber-hi)',   border: 'rgba(251,191,36,0.30)',  label: 'Aberta'       },
  em_andamento: { bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd',          border: 'rgba(59,130,246,0.30)',  label: 'Em andamento' },
  concluida:    { bg: 'rgba(16,185,129,0.12)',  color: 'var(--emerald-hi)', border: 'rgba(16,185,129,0.30)', label: 'Concluída'    },
  cancelada:    { bg: 'var(--alpha-bg-xs)',      color: 'var(--text-soft-a)',border: 'var(--alpha-border)',   label: 'Cancelada'    },
}

export function TarefaStatusBadge({ status }: { status: TarefaStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold border"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      {s.label}
    </span>
  )
}

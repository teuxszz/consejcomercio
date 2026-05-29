import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClienteDoc, StatusDoc } from '@/types'

interface Props {
  /** Histórico de versões anteriores ao current (ordenado desc por versão). */
  history: ClienteDoc[]
}

/**
 * Timeline inline de versões anteriores (D-02). Renderiza nada quando o histórico
 * está vazio (current sozinho não tem o que mostrar). Pattern: dropdown que
 * expande/colapsa com ChevronDown (mirror RESEARCH §6 linhas 644-675).
 *
 * Usa apenas dados já em memória — Plan 03 popula `history` via `groupByRoot`
 * em `src/lib/doc-grouping.ts`.
 */
export function DocVersionTimeline({ history }: Props) {
  const [open, setOpen] = useState(false)

  if (history.length === 0) return null

  return (
    <div className="border-t pt-2 mt-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            'w-3 h-3 transition-transform',
            open && 'rotate-180',
          )}
        />
        Ver versões anteriores ({history.length})
      </button>
      {open && (
        <ul
          role="list"
          className="mt-2 space-y-1 text-xs text-muted-foreground pl-4 border-l border-border"
        >
          {history.map(v => (
            <li key={v.id} className="flex items-center gap-2">
              <span className="font-mono text-primary">v{v.versao}</span>
              <span>{formatDate(v.created_at)}</span>
              {v.status && <StatusChip status={v.status} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatusChip({ status }: { status: Exclude<StatusDoc, null> }) {
  const cls = (() => {
    switch (status) {
      case 'aprovado':
        return 'bg-emerald-500/10 text-emerald-500'
      case 'revisao_solicitada':
        return 'bg-amber-500/10 text-amber-500'
      case 'pending':
        return 'bg-amber-400/10 text-amber-400'
      case 'superseded':
        return 'bg-muted text-muted-foreground'
    }
  })()
  return <span className={cn('px-1.5 rounded', cls)}>{status}</span>
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

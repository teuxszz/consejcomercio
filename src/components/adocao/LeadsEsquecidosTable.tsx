import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLeadsEsquecidos } from '@/hooks/useAdocao'
import { STAGE_COLORS } from '@/lib/constants'

type Props = { variant: 'compact' | 'full' }

export function LeadsEsquecidosTable({ variant }: Props) {
  const navigate = useNavigate()
  const { data: leads = [], isLoading } = useLeadsEsquecidos()

  const displayed = variant === 'compact' ? leads.slice(0, 5) : leads

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--alpha-bg-sm)' }} />
        ))}
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <CheckCircle2 className="w-4 h-4" style={{ color: '#6ee7b7' }} />
        Todos os leads estão sendo atualizados regularmente.
      </div>
    )
  }

  const now = new Date()

  if (variant === 'compact') {
    return (
      <div className="space-y-1">
        {displayed.map(l => {
          const dias = differenceInDays(now, new Date(l.updated_at))
          return (
            <div
              key={l.id}
              className="flex items-center justify-between text-xs py-1 cursor-pointer hover:text-fg2 transition-colors"
              onClick={() => navigate(`/leads/${l.id}`)}
              style={{ color: 'var(--text-soft-a)' }}
            >
              <span className="truncate flex-1">{l.nome} · {l.empresa}</span>
              <span className="shrink-0 ml-2" style={{ color: '#fca5a5' }}>{dias}d sem update</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground" style={{ borderColor: 'var(--alpha-border)' }}>
              <th className="px-4 py-2 text-left font-medium">Lead</th>
              <th className="px-4 py-2 text-left font-medium">Empresa</th>
              <th className="px-4 py-2 text-left font-medium">Etapa</th>
              <th className="px-4 py-2 text-left font-medium">Sem atualização</th>
              <th className="px-4 py-2 text-left font-medium">Responsável</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--alpha-border)' }}>
            {displayed.map(l => {
              const dias = differenceInDays(now, new Date(l.updated_at))
              const stageColor = STAGE_COLORS[l.status] ?? 'bg-[var(--alpha-bg-sm)] text-muted-foreground border-[var(--alpha-border)]'
              return (
                <tr key={l.id} className="hover:bg-[var(--alpha-bg-xs)] transition-colors">
                  <td className="px-4 py-2.5 font-medium text-fg2 truncate max-w-[160px]">{l.nome}</td>
                  <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[120px]">{l.empresa}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${stageColor}`}>
                      {l.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] font-medium" style={{ color: '#fca5a5' }}>{dias}d</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.responsavel ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/leads/${l.id}`)}>
                      Ver lead
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

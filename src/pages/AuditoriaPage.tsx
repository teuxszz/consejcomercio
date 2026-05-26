import { useAllAuditLogs } from '@/hooks/useAuditLogs'
import { useLeadsLixeira, useRestaurarLead } from '@/hooks/useLeads'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { ClipboardList, RotateCcw, Trash2 } from 'lucide-react'

const ACAO_COLORS: Record<string, { bg: string; color: string }> = {
  criado:              { bg: 'rgba(16,185,129,0.15)',  color: '#34d399' },
  atualizado:          { bg: 'rgba(59,130,246,0.15)',  color: '#93c5fd' },
  excluido:            { bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
  status_alterado:     { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24' },
  convertido:          { bg: 'rgba(0,137,172,0.15)',   color: '#6bd0e7' },
  recompensa_entregue: { bg: 'rgba(139,92,246,0.15)',  color: '#a78bfa' },
  restaurado:          { bg: 'rgba(16,185,129,0.15)',  color: '#34d399' },
}

export function AuditoriaPage() {
  const { data: logs, isLoading } = useAllAuditLogs()
  const { data: lixeira } = useLeadsLixeira()
  const restaurar = useRestaurarLead()
  const { isCoordenadorOrAcima } = useCurrentRole()
  const pendentes = lixeira ?? []

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-6">Auditoria</h1>

      {pendentes.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Lixeira de leads ({pendentes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {pendentes.map(item => (
                <div key={item.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-fg2 font-medium truncate">
                      {item.lead_nome ?? '—'}
                      {item.lead_empresa && <span className="text-fg4"> · {item.lead_empresa}</span>}
                    </p>
                    <p className="text-xs text-fg4">
                      excluído por {item.excluido_por_nome ?? '—'} · {formatDate(item.excluido_em)}
                    </p>
                  </div>
                  {isCoordenadorOrAcima && (
                    <Button
                      variant="ghost"
                      className="gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                      disabled={restaurar.isPending}
                      onClick={() => restaurar.mutate(item.id)}
                    >
                      <RotateCcw className="w-4 h-4" /> Restaurar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? <div className="text-center text-muted-foreground py-8">Carregando...</div> : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Log de atividades (últimas {logs?.length || 0} entradas)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {logs?.map(log => (
                <div key={log.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-28 shrink-0">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={ACAO_COLORS[log.acao]
                        ? { background: ACAO_COLORS[log.acao].bg, color: ACAO_COLORS[log.acao].color }
                        : { background: 'var(--alpha-bg-xs)', color: 'var(--text-soft-a)' }}
                    >
                      {log.acao}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-fg2">
                      <span className="font-medium capitalize">{log.tabela.replace(/_/g, ' ')}</span>
                      {log.campo && <span className="text-fg4"> · {log.campo}</span>}
                    </p>
                    {log.usuario && <p className="text-xs text-fg4">{log.usuario}</p>}
                  </div>
                  <p className="text-xs text-fg4 shrink-0">{formatDate(log.created_at)}</p>
                </div>
              ))}
              {!logs?.length && (
                <div className="text-center text-fg4 py-12">Nenhuma atividade registrada.</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

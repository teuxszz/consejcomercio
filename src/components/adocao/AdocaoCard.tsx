import { useNavigate } from 'react-router-dom'
import { Activity, LogIn, UserPlus, CheckSquare, AlertTriangle } from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdocaoLogins, useLeadsEsquecidos } from '@/hooks/useAdocao'
import { useLeads } from '@/hooks/useLeads'
import { useTarefas } from '@/hooks/useTarefas'

export function AdocaoCard() {
  const navigate = useNavigate()
  const { data: logins   = [] } = useAdocaoLogins()
  const { data: esquecidos = [] } = useLeadsEsquecidos()
  const { data: leads    = [] } = useLeads()
  const { data: tarefas  = [] } = useTarefas()

  const now = new Date()

  const loginsUnicos  = new Set(logins.map(l => l.registro_id)).size
  const leadsSemana   = leads.filter(l => differenceInDays(now, new Date(l.created_at)) <= 7).length
  const tarefasSemana = tarefas.filter(t => differenceInDays(now, new Date(t.created_at)) <= 7).length

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: 'var(--cyan-hi)' }} />
          Adoção do time (últimos 7 dias)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full mb-1" style={{ background: 'rgba(0,137,172,0.12)' }}>
              <LogIn className="w-4 h-4" style={{ color: 'var(--cyan-hi)' }} />
            </div>
            <p className="text-2xl font-bold text-foreground">{loginsUnicos}</p>
            <p className="text-xs text-muted-foreground">Logins únicos</p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full mb-1" style={{ background: 'rgba(16,185,129,0.12)' }}>
              <UserPlus className="w-4 h-4" style={{ color: 'var(--emerald-hi)' }} />
            </div>
            <p className="text-2xl font-bold text-foreground">{leadsSemana}</p>
            <p className="text-xs text-muted-foreground">Leads criados</p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full mb-1" style={{ background: 'rgba(251,191,36,0.12)' }}>
              <CheckSquare className="w-4 h-4" style={{ color: 'var(--amber-hi)' }} />
            </div>
            <p className="text-2xl font-bold text-foreground">{tarefasSemana}</p>
            <p className="text-xs text-muted-foreground">Tarefas criadas</p>
          </div>
        </div>

        <div className="border-t pt-4" style={{ borderColor: 'var(--alpha-border)' }}>
          <h3 className="text-xs font-semibold text-fg2 flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-[#fca5a5]" />
            Leads sem atualização há 7+ dias
          </h3>
          {esquecidos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum lead esquecido — ótimo!</p>
          ) : (
            <div className="space-y-1">
              {esquecidos.slice(0, 3).map(l => {
                const dias = differenceInDays(now, new Date(l.updated_at))
                return (
                  <div
                    key={l.id}
                    className="flex items-center justify-between text-xs py-0.5 cursor-pointer hover:text-fg2 transition-colors"
                    onClick={() => navigate(`/leads/${l.id}`)}
                    style={{ color: 'var(--text-soft-a)' }}
                  >
                    <span className="truncate flex-1">{l.nome} · {l.empresa}</span>
                    <span className="shrink-0 ml-2" style={{ color: '#fca5a5' }}>{dias}d</span>
                  </div>
                )
              })}
              {esquecidos.length > 3 && (
                <button
                  type="button"
                  onClick={() => navigate('/adocao')}
                  className="text-xs mt-1 transition-colors hover:underline"
                  style={{ color: 'var(--cyan-hi)' }}
                >
                  + {esquecidos.length - 3} mais → ver todos em Adoção
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

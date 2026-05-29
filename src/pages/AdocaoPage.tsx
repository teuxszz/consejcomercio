import { Users } from 'lucide-react'
import { differenceInDays, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { RequireRole } from '@/components/shared/RequireRole'
import { QuotaResendBanner } from '@/components/shared/QuotaResendBanner'
import { LeadsEsquecidosTable } from '@/components/adocao/LeadsEsquecidosTable'
import { ExportarPDFEquipeButton } from '@/components/desempenho/ExportarPDFEquipeButton'
import { loadPeriod } from '@/lib/desempenho-period'
import { useAdocaoAtividade } from '@/hooks/useAdocao'

function AdocaoContent() {
  const { data: atividade = [], isLoading } = useAdocaoAtividade()
  const navigate = useNavigate()
  const now = new Date()
  const period = loadPeriod()

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">Adoção</h1>
        <RequireRole atLeast="coordenador" fallback={null}>
          <ExportarPDFEquipeButton periodo={period} />
        </RequireRole>
      </div>

      <RequireRole atLeast="coordenador">
        <QuotaResendBanner />
      </RequireRole>

      <section>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Atividade no mês
        </h2>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--alpha-bg-sm)' }} />
                ))}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground" style={{ borderColor: 'var(--alpha-border)' }}>
                    <th className="px-4 py-2 text-left font-medium">Usuário</th>
                    <th className="px-4 py-2 text-left font-medium">Último login</th>
                    <th className="px-4 py-2 text-right font-medium">Leads criados</th>
                    <th className="px-4 py-2 text-right font-medium">Tarefas criadas</th>
                    <th className="px-4 py-2 text-right font-medium">Leads atualizados</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--alpha-border)' }}>
                  {atividade.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma atividade registrada este mês.</td></tr>
                  ) : atividade.map(p => {
                    const iniciais = p.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                    const diasSemLogin = p.ultimoLogin ? differenceInDays(now, new Date(p.ultimoLogin)) : null
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-[var(--alpha-bg-xs)] cursor-pointer transition-colors"
                        onClick={() => navigate(`/me/desempenho/${p.id}`)}
                        title={`Ver desempenho de ${p.nome}`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-cyan-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                              {iniciais}
                            </div>
                            <div>
                              <p className="text-xs font-medium text-fg2">{p.nome}</p>
                              {p.role && <p className="text-[10px] text-muted-foreground capitalize">{p.role}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {p.ultimoLogin
                            ? <span style={diasSemLogin && diasSemLogin > 5 ? { color: '#fca5a5' } : {}}>
                                {formatDistanceToNow(new Date(p.ultimoLogin), { addSuffix: true, locale: ptBR })}
                              </span>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          <span className={p.leadsCriados === 0 ? 'text-muted-foreground' : 'text-foreground font-medium'}>{p.leadsCriados}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          <span className={p.tarefasCriadas === 0 ? 'text-muted-foreground' : 'text-foreground font-medium'}>{p.tarefasCriadas}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          <span className={p.leadsAtualizados === 0 ? 'text-muted-foreground' : 'text-foreground font-medium'}>{p.leadsAtualizados}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">
          Leads esquecidos (7+ dias sem atualização)
        </h2>
        <LeadsEsquecidosTable variant="full" />
      </section>
    </div>
  )
}

export function AdocaoPage() {
  return (
    <RequireRole atLeast="coordenador">
      <AdocaoContent />
    </RequireRole>
  )
}

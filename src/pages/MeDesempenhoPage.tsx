// Phase 8 (Plan 02) — /me/desempenho [/:perfilId] — pagina visivel do
// relatorio individual de desempenho.
//
// - Sem param  → mostra dados do auth user (qualquer role autenticado)
// - Com param → mostra dados de outro consultor; bloqueia consultor regular
//   via RequireRole condicional quando perfilId !== meuPerfil.id (Pitfall 4)
//
// PeriodSelector wired com loadPeriod/savePeriod (D-06 localStorage).
// Consome calcularDesempenho (Plan 01) + DesempenhoKpiGrid + 3 charts.

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMeuPerfil, usePerfis } from '@/hooks/usePerfis'
import { useLeads } from '@/hooks/useLeads'
import { useTarefas } from '@/hooks/useTarefas'
import { useClientes } from '@/hooks/useClientes'
import { useContratos } from '@/hooks/useContratos'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import { calcularDesempenho } from '@/lib/desempenho'
import { loadPeriod, savePeriod } from '@/lib/desempenho-period'
import type { PeriodValue } from '@/lib/periods'
import { getPeriodRange, isInRange } from '@/lib/periods'
import { PeriodSelector } from '@/components/shared/PeriodSelector'
import { RequireRole } from '@/components/shared/RequireRole'
import { DesempenhoKpiGrid } from '@/components/desempenho/DesempenhoKpiGrid'
import { DesempenhoFunilChart } from '@/components/desempenho/DesempenhoFunilChart'
import { DesempenhoTimelineChart } from '@/components/desempenho/DesempenhoTimelineChart'
import { DesempenhoTarefasChart } from '@/components/desempenho/DesempenhoTarefasChart'
import { ExportarPDFButton } from '@/components/desempenho/ExportarPDFButton'
import { ExportarCSVButton } from '@/components/desempenho/ExportarCSVButton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function MeDesempenhoPage() {
  const params = useParams<{ perfilId?: string }>()
  const { data: meuPerfil, isLoading: loadingMeu } = useMeuPerfil()
  const { data: perfis = [] } = usePerfis()
  const { data: leads = [] } = useLeads()
  const { data: tarefas = [] } = useTarefas()
  const { data: clientes = [] } = useClientes()
  const { data: contratos = [] } = useContratos()
  const { data: config } = useConfiguracoes()

  const [period, setPeriod] = useState<PeriodValue>(() => loadPeriod())
  useEffect(() => { savePeriod(period) }, [period])

  const targetId = params.perfilId ?? meuPerfil?.id ?? ''
  const isViewingOther = !!params.perfilId && params.perfilId !== meuPerfil?.id
  const targetPerfil = perfis.find(p => p.id === targetId) ?? meuPerfil

  const metrics = useMemo(() => {
    if (!targetId || !targetPerfil) return null
    return calcularDesempenho({
      leads,
      tarefas,
      clientes,
      contratos,
      perfilId: targetId,
      perfilNome: targetPerfil.nome ?? '—',
      periodo: period,
      servicosConfig: config?.servicos ?? [],
    })
  }, [leads, tarefas, clientes, contratos, targetId, targetPerfil, period, config])

  // Snapshots filtrados (perfil + periodo) para os exports — evita enviar
  // dataset completo aos botoes. Memoizados para nao quebrar referencia em
  // re-renders de PeriodSelector.
  const periodRange = useMemo(() => getPeriodRange(period), [period])

  const leadsDoPerfil = useMemo(
    () => leads.filter(l => l.responsavel_id === targetId && isInRange(l.created_at, periodRange)),
    [leads, targetId, periodRange],
  )

  const tarefasDoPerfil = useMemo(
    () => tarefas.filter(t => t.atribuido_a_id === targetId && isInRange(t.created_at, periodRange)),
    [tarefas, targetId, periodRange],
  )

  const contratosDoPerfil = useMemo(() => {
    const filtered = contratos.filter(
      c => c.responsavel_id === targetId && isInRange(c.created_at, periodRange),
    )
    // Anexa cliente_nome derivado para o CSV (T-08-03 sanitize aplicado no lib)
    return filtered.map(c => ({
      ...c,
      cliente_nome: c.cliente?.nome ?? '',
    }))
  }, [contratos, targetId, periodRange])

  if (loadingMeu) return <div className="text-sm text-muted-foreground">Carregando…</div>
  if (!meuPerfil) return <div className="text-sm text-muted-foreground">Sem perfil autenticado.</div>
  if (!metrics || !targetPerfil) return <div className="text-sm text-muted-foreground">Sem dados.</div>

  const content = (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Desempenho — {targetPerfil.nome}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {isViewingOther
              ? 'Visualização de outro consultor (coord+).'
              : 'Métricas do seu próprio trabalho no período selecionado.'}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <PeriodSelector value={period} onChange={setPeriod} derivedYearsFrom={leads} />
          <ExportarPDFButton
            metrics={metrics}
            leads={leadsDoPerfil}
            tarefas={tarefasDoPerfil}
            perfilNome={targetPerfil?.nome ?? '—'}
          />
          <ExportarCSVButton
            perfilNome={targetPerfil?.nome ?? '—'}
            periodoLabel={`${period.year}-${period.granularity}`}
            leads={leadsDoPerfil}
            tarefas={tarefasDoPerfil}
            contratos={contratosDoPerfil}
          />
        </div>
      </div>

      {/* ── KPI grid 4x2 ──────────────────────────────────────────────── */}
      <DesempenhoKpiGrid metrics={metrics} />

      {/* ── Charts ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Funil de conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <DesempenhoFunilChart metrics={metrics} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Leads criados ao longo do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <DesempenhoTimelineChart leads={leads} periodo={period} perfilId={targetId} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Distribuição de tarefas</CardTitle>
          </CardHeader>
          <CardContent>
            <DesempenhoTarefasChart tarefas={tarefas} periodo={period} perfilId={targetId} />
          </CardContent>
        </Card>
      </div>
    </div>
  )

  return isViewingOther
    ? <RequireRole atLeast="coordenador">{content}</RequireRole>
    : content
}

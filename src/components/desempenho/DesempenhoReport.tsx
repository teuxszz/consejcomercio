// Phase 8 (Plan 02) — Off-screen renderer das 3 paginas A4 do relatorio
// individual de desempenho. Montado via createPortal em document.body,
// posicionado top: -9999px (Pattern 2 RESEARCH lines 386-441).
//
// Por que portal e nao hidden div?
//   - display:none / visibility:hidden quebra recharts (sem calculo de tamanhos)
//   - portal fora do tree de layout impede que CSS pai (transforms/overflow)
//     influencie renderizacao
//   - mais limpo para Plan 03 (pdf-export) localizar via [data-pdf-root]
//
// Cores hex fixas (NAO usar CSS vars) — html2canvas nao resolve var()
// confiavelmente (Pitfall 2 RESEARCH). Background branco + texto #0d1929
// para captura em light theme (Pattern 6 RESEARCH).
//
// 3 sub-divs anotadas como pdf-page 1, 2 e 3 (attribute applicado abaixo) para
// Plan 03 iterar e capturar individualmente via html2canvas (Pattern 3 RESEARCH).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DesempenhoMetricas, Lead, Tarefa } from '@/types'
import { formatPeriodLabel } from '@/lib/periods'
import { DesempenhoKpiGrid } from './DesempenhoKpiGrid'
import { DesempenhoFunilChart } from './DesempenhoFunilChart'
import { DesempenhoTimelineChart } from './DesempenhoTimelineChart'
import { DesempenhoTarefasChart } from './DesempenhoTarefasChart'
import { KPICard } from './KPICard'
import { Star, Target } from 'lucide-react'

const A4_PT_WIDTH = 794   // 210mm @ 96dpi
const A4_PT_HEIGHT = 1123 // 297mm @ 96dpi

interface Props {
  metrics: DesempenhoMetricas
  perfilNome: string
  leads: Lead[]
  tarefas: Tarefa[]
  geradoEm: Date
}

const PAGE_STYLE: React.CSSProperties = {
  width: A4_PT_WIDTH,
  height: A4_PT_HEIGHT,
  padding: 40,
  background: 'white',
  color: '#0d1929',
  boxSizing: 'border-box',
}

const ROOT_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: '-9999px',
  left: '-9999px',
  width: `${A4_PT_WIDTH}px`,
  pointerEvents: 'none',
  background: 'white',
  color: '#0d1929',
}

const TITLE_STYLE: React.CSSProperties = { fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#0d1929' }

export function DesempenhoReport({ metrics, perfilNome, leads, tarefas, geradoEm }: Props) {
  // Portal so monta no client — evita SSR/test-edge issues
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const periodoLabel = formatPeriodLabel(metrics.periodo)
  const geradoLabel = format(geradoEm, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  return createPortal(
    <div
      data-pdf-root
      style={ROOT_STYLE}
    >
      {/* ── Pagina 1: header + KPI grid 4x2 + footer ─────────────────────── */}
      <div data-pdf-page="1" style={PAGE_STYLE}>
        <div style={{ borderBottom: '2px solid #0089ac', paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#0089ac', letterSpacing: 1 }}>CONSEJ</span>
            <span style={{ fontSize: 11, color: '#475569' }}>Relatório de Desempenho</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 16, color: '#0d1929' }}>{perfilNome}</h1>
          <p style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Período: {periodoLabel}</p>
        </div>

        <h2 style={TITLE_STYLE}>Métricas-chave</h2>
        <DesempenhoKpiGrid metrics={metrics} />

        <div style={{ position: 'absolute', bottom: 40, left: 40, right: 40, borderTop: '1px solid #e2e8f0', paddingTop: 12, fontSize: 10, color: '#64748b' }}>
          Gerado em {geradoLabel}
        </div>
      </div>

      {/* ── Pagina 2: funil + timeline ────────────────────────────────────── */}
      <div data-pdf-page="2" style={PAGE_STYLE}>
        <h2 style={TITLE_STYLE}>Funil de conversão</h2>
        <div style={{ background: 'white', marginBottom: 32 }}>
          <DesempenhoFunilChart metrics={metrics} />
        </div>

        <h2 style={TITLE_STYLE}>Leads criados ao longo do tempo</h2>
        <div style={{ background: 'white' }}>
          <DesempenhoTimelineChart leads={leads} periodo={metrics.periodo} perfilId={metrics.perfilId} />
        </div>
      </div>

      {/* ── Pagina 3: tarefas + 2 KPIs grandes (ICP fit + NPS) ────────────── */}
      <div data-pdf-page="3" style={PAGE_STYLE}>
        <h2 style={TITLE_STYLE}>Distribuição de tarefas</h2>
        <div style={{ background: 'white', marginBottom: 32 }}>
          <DesempenhoTarefasChart tarefas={tarefas} periodo={metrics.periodo} perfilId={metrics.perfilId} />
        </div>

        <h2 style={TITLE_STYLE}>Qualidade e satisfação</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <KPICard
            title="ICP fit médio"
            value={metrics.icp_fit_medio === null ? null : `${metrics.icp_fit_medio}%`}
            icon={Target}
            tone="emerald"
          />
          <KPICard
            title="NPS médio"
            value={metrics.nps_medio === null ? null : metrics.nps_medio.toFixed(1)}
            icon={Star}
            tone="amber"
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}

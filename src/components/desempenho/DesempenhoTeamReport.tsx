// Phase 8 Plan 04 (D-07 + Pattern 4 RESEARCH) — Off-screen renderer
// multi-variant do relatorio de equipe.
//
// 3 modos (variant prop):
//   - 'capa'     : titulo equipe + periodo + KPI grid com TOTAIS + footer
//   - 'consultor': 1 pagina por consultor (header nome + KPI grid + funil)
//   - 'ranking'  : tabela "Nome | Leads | Convertidos | Win % | NPS" sorted
//
// Pattern espelha DesempenhoReport (Plan 02):
//   - createPortal para body, position fixed top:-9999px
//   - data-pdf-root container, data-pdf-page="1" per variant
//   - Cores hex fixas (NAO CSS vars — html2canvas Pitfall 2)
//   - isAnimationActive={false} em qualquer chart (Pitfall 1)
//
// O caller (gerarRelatorioEquipe) monta o componente, espera RAF, captura via
// html2canvas, e desmonta antes de remontar para a proxima variant.

import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DesempenhoMetricas, DesempenhoConsultorTeam, Lead, Tarefa } from '@/types'
import { DesempenhoKpiGrid } from './DesempenhoKpiGrid'
import { DesempenhoFunilChart } from './DesempenhoFunilChart'

const A4_PT_WIDTH = 794   // 210mm @ 96dpi
const A4_PT_HEIGHT = 1123 // 297mm @ 96dpi

export type TeamReportVariant = 'capa' | 'consultor' | 'ranking'

export interface ConsultorReportData extends DesempenhoConsultorTeam {
  leads: Lead[]
  tarefas: Tarefa[]
}

interface Props {
  variant: TeamReportVariant
  totais?: DesempenhoMetricas
  consultor?: ConsultorReportData
  ranking?: DesempenhoConsultorTeam[]
  periodoLabel: string
  geradoEm: Date
}

const PAGE_STYLE: React.CSSProperties = {
  width: A4_PT_WIDTH,
  height: A4_PT_HEIGHT,
  padding: 40,
  background: 'white',
  color: '#0d1929',
  boxSizing: 'border-box',
  position: 'relative',
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

const TITLE_STYLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 12,
  color: '#0d1929',
}

export function DesempenhoTeamReport(props: Props) {
  if (typeof document === 'undefined') return null

  const geradoLabel = format(props.geradoEm, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  return createPortal(
    <div data-pdf-root style={ROOT_STYLE}>
      {props.variant === 'capa' && props.totais && (
        <div data-pdf-page="1" style={PAGE_STYLE}>
          <div style={{ borderBottom: '2px solid #0089ac', paddingBottom: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#0089ac', letterSpacing: 1 }}>CONSEJ</span>
              <span style={{ fontSize: 11, color: '#475569' }}>Relatório de Desempenho da Equipe</span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 16, color: '#0d1929' }}>
              Equipe CONSEJ
            </h1>
            <p style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Período: {props.periodoLabel}</p>
          </div>

          <h2 style={TITLE_STYLE}>Totais da equipe</h2>
          <DesempenhoKpiGrid metrics={props.totais} />

          <div style={{ position: 'absolute', bottom: 40, left: 40, right: 40, borderTop: '1px solid #e2e8f0', paddingTop: 12, fontSize: 10, color: '#64748b' }}>
            Gerado em {geradoLabel}
          </div>
        </div>
      )}

      {props.variant === 'consultor' && props.consultor && (
        <div data-pdf-page="1" style={PAGE_STYLE}>
          <div style={{ borderBottom: '2px solid #0089ac', paddingBottom: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0089ac', letterSpacing: 1 }}>CONSEJ</span>
              <span style={{ fontSize: 11, color: '#475569' }}>Período: {props.periodoLabel}</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 16, color: '#0d1929' }}>
              {props.consultor.perfilNome}
            </h1>
          </div>

          <h2 style={TITLE_STYLE}>Métricas-chave</h2>
          <DesempenhoKpiGrid metrics={props.consultor.metricas} />

          <h2 style={{ ...TITLE_STYLE, marginTop: 24 }}>Funil de conversão</h2>
          <div style={{ background: 'white' }}>
            <DesempenhoFunilChart metrics={props.consultor.metricas} />
          </div>
        </div>
      )}

      {props.variant === 'ranking' && props.ranking && (
        <div data-pdf-page="1" style={PAGE_STYLE}>
          <div style={{ borderBottom: '2px solid #0089ac', paddingBottom: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0089ac', letterSpacing: 1 }}>CONSEJ</span>
              <span style={{ fontSize: 11, color: '#475569' }}>Período: {props.periodoLabel}</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 16, color: '#0d1929' }}>
              Ranking — convertidos
            </h1>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#0d1929' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f8fafc' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>#</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Consultor</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Leads</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Convertidos</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Win %</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>NPS</th>
              </tr>
            </thead>
            <tbody>
              {props.ranking.map((c, idx) => (
                <tr key={c.perfilId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 12px', color: '#64748b' }}>{idx + 1}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{c.perfilNome}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {c.metricas.leads_criados}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {c.metricas.convertidos}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {c.metricas.win_rate}%
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {c.metricas.nps_medio === null ? '—' : c.metricas.nps_medio.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ position: 'absolute', bottom: 40, left: 40, right: 40, borderTop: '1px solid #e2e8f0', paddingTop: 12, fontSize: 10, color: '#64748b' }}>
            Gerado em {geradoLabel} · Ordenado por leads convertidos (desc)
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

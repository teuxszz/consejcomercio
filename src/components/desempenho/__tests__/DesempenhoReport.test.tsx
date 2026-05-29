// Phase 8 Plan 02 — Tests para KPICard + DesempenhoKpiGrid.
// Tests cobrem null-safety (Pitfall 6: NPS undefined renderiza '—'), grid CSS
// classes (4x2 lg:grid-cols-4) e fallback de 3 metricas null sem crash.
// DesempenhoReport (portal off-screen) nao tem testes diretos aqui — montagem
// em portal off-screen e capturada por jsdom de forma instavel; smoke test
// no Plan 03 valida o renderer end-to-end via mocks de html2canvas.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Users } from 'lucide-react'
import { KPICard } from '../KPICard'
import { DesempenhoKpiGrid } from '../DesempenhoKpiGrid'
import type { DesempenhoMetricas } from '@/types'

const PERIODO_2026 = { year: 2026, granularity: 'total' as const }

function fixtureMetrics(overrides: Partial<DesempenhoMetricas> = {}): DesempenhoMetricas {
  return {
    perfilId: 'p1',
    perfilNome: 'Gabriel',
    periodo: PERIODO_2026,
    leads_criados: 12,
    convertidos: 4,
    perdidos: 2,
    ciclo_medio_dias: 8,
    win_rate: 67,
    icp_fit_medio: 75,
    tarefas_concluidas: 9,
    nps_medio: 8.5,
    ...overrides,
  }
}

describe('KPICard', () => {
  it('renderiza title + value (number)', () => {
    render(<KPICard title="Leads criados" value={12} icon={Users} />)
    expect(screen.getByText('Leads criados')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('value=null renderiza "—" (fallback NPS undefined)', () => {
    render(<KPICard title="NPS médio" value={null} icon={Users} />)
    expect(screen.getByText('NPS médio')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('value string passa direto', () => {
    render(<KPICard title="Win Rate" value="67%" icon={Users} />)
    expect(screen.getByText('67%')).toBeInTheDocument()
  })
})

describe('DesempenhoKpiGrid', () => {
  it('renderiza 8 KPI cards numa grid grid-cols-2 lg:grid-cols-4', () => {
    const { container } = render(<DesempenhoKpiGrid metrics={fixtureMetrics()} />)
    const grid = container.querySelector('.grid-cols-2.lg\\:grid-cols-4')
    expect(grid).not.toBeNull()
    // Cada KPICard tem um titulo unico — checamos pela presenca de 8 titulos D-11
    expect(screen.getByText('Leads criados')).toBeInTheDocument()
    expect(screen.getByText('Convertidos')).toBeInTheDocument()
    expect(screen.getByText('Perdidos')).toBeInTheDocument()
    expect(screen.getByText('Win Rate')).toBeInTheDocument()
    expect(screen.getByText('Ciclo médio')).toBeInTheDocument()
    expect(screen.getByText('ICP fit médio')).toBeInTheDocument()
    expect(screen.getByText('Tarefas concluídas')).toBeInTheDocument()
    expect(screen.getByText('NPS médio')).toBeInTheDocument()
  })

  it('nps_medio=null + ciclo_medio_dias=null + icp_fit_medio=null mostram "—" sem crash', () => {
    render(
      <DesempenhoKpiGrid
        metrics={fixtureMetrics({
          nps_medio: null,
          ciclo_medio_dias: null,
          icp_fit_medio: null,
        })}
      />,
    )
    // Devem existir pelo menos 3 ocorrencias de "—" (uma para cada metrica null)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })
})

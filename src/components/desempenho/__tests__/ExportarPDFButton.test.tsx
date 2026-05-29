// Phase 8 (Plan 03 Task 3) — Tests do componente ExportarPDFButton.
//
// Foco: comportamento UX do botao (render, click, toast). A logica de PDF
// (lazy import, theme toggle, setProperties) e testada isoladamente em
// src/lib/__tests__/pdf-export.test.ts.
//
// gerarRelatorioIndividual e mockado para validar apenas integracao
// click→lib→toast.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// vi.mock e hoisted — precisamos de vi.hoisted para as fns referenciadas
const { gerarRelatorioIndividualMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  gerarRelatorioIndividualMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@/lib/pdf-export', () => ({
  gerarRelatorioIndividual: gerarRelatorioIndividualMock,
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

// DesempenhoReport faz uso de react-dom createPortal — mockar para evitar
// que tente renderizar charts em jsdom durante o teste de click. Stub
// apenas insere [data-pdf-root] no body para satisfazer querySelector do
// componente.
vi.mock('../DesempenhoReport', () => ({
  DesempenhoReport: () => {
    if (typeof document === 'undefined') return null
    // O stub renderiza o atributo procurado por handleExport
    return <div data-pdf-root data-testid="report-stub" />
  },
}))

import { ExportarPDFButton } from '../ExportarPDFButton'
import type { DesempenhoMetricas } from '@/types'

function buildMetrics(): DesempenhoMetricas {
  return {
    perfilId: 'p1',
    perfilNome: 'João da Silva',
    periodo: { year: 2026, granularity: 'q1' },
    leads_criados: 10,
    convertidos: 3,
    perdidos: 4,
    ciclo_medio_dias: 12,
    win_rate: 43,
    icp_fit_medio: 78,
    tarefas_concluidas: 25,
    nps_medio: 8.5,
  }
}

describe('ExportarPDFButton', () => {
  beforeEach(() => {
    gerarRelatorioIndividualMock.mockClear()
    gerarRelatorioIndividualMock.mockResolvedValue(undefined)
    toastSuccessMock.mockClear()
    toastErrorMock.mockClear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renderiza com texto "Exportar PDF"', () => {
    render(
      <ExportarPDFButton
        metrics={buildMetrics()}
        leads={[]}
        tarefas={[]}
        perfilNome="João da Silva"
      />,
    )
    expect(screen.getByRole('button', { name: /exportar pdf/i })).toBeInTheDocument()
  })

  it('chama gerarRelatorioIndividual no click e dispara toast.success', async () => {
    render(
      <ExportarPDFButton
        metrics={buildMetrics()}
        leads={[]}
        tarefas={[]}
        perfilNome="João da Silva"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /exportar pdf/i }))

    await waitFor(() => {
      expect(gerarRelatorioIndividualMock).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('PDF gerado')
    })
  })

  it('toast.error quando gerarRelatorioIndividual rejeita', async () => {
    gerarRelatorioIndividualMock.mockRejectedValueOnce(new Error('falhou'))
    render(
      <ExportarPDFButton
        metrics={buildMetrics()}
        leads={[]}
        tarefas={[]}
        perfilNome="João da Silva"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /exportar pdf/i }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('falhou')
    })
  })
})

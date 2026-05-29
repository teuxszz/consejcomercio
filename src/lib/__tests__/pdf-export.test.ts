// Phase 8 (Plan 03) — Tests para src/lib/pdf-export.ts.
//
// Estrategia: vi.mock dinamico de 'jspdf' + 'html2canvas' usando factories de
// src/test/pdf-mocks. Asserts cobrem:
//   - lazy import resolve e fluxo executa (1 RAF wait OK)
//   - setProperties() chamado com strings vazias (T-08-01)
//   - addImage chamado 1x por pagina + addPage chamado n-1 vezes
//   - filename respeita pattern desempenho_<slug>_<year>-<granularity>.pdf
//   - theme dark e restaurado em finally mesmo quando captura falha (Pitfall 5)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockJsPdf, mockHtml2canvas } from '@/test/pdf-mocks'
import type { DesempenhoMetricas } from '@/types'

// Mocks instalados antes do import dinamico dentro de gerarRelatorioIndividual
const jsPdfMock = mockJsPdf()
const html2canvasMock = mockHtml2canvas()

vi.mock('jspdf', () => ({
  jsPDF: jsPdfMock.jsPDFClass,
  default: jsPdfMock.jsPDFClass,
}))

vi.mock('html2canvas', () => ({
  default: html2canvasMock.html2canvasFn,
}))

// Spy de setProperties — precisa ser exposto pelo jsPDF mock para esse teste.
// Adicionamos um wrapper que sobrescreve o factory do mock para tracking.
const setPropertiesFn = vi.fn()
jsPdfMock.jsPDFClass.mockImplementation(() => ({
  addImage: jsPdfMock.addImageFn,
  addPage: jsPdfMock.addPageFn,
  save: jsPdfMock.saveFn,
  setProperties: setPropertiesFn,
}))

import { gerarRelatorioIndividual } from '../pdf-export'

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

function buildRootElWith3Pages(): HTMLElement {
  const root = document.createElement('div')
  for (let i = 1; i <= 3; i++) {
    const page = document.createElement('div')
    page.setAttribute('data-pdf-page', String(i))
    root.appendChild(page)
  }
  document.body.appendChild(root)
  return root
}

describe('gerarRelatorioIndividual', () => {
  beforeEach(() => {
    setPropertiesFn.mockReset()
    jsPdfMock.addImageFn.mockReset()
    jsPdfMock.addPageFn.mockReset()
    jsPdfMock.saveFn.mockReset()
    jsPdfMock.savedFiles.length = 0
    html2canvasMock.html2canvasFn.mockClear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.documentElement.classList.remove('dark', 'light')
  })

  it('captura todas as paginas data-pdf-page', async () => {
    const root = buildRootElWith3Pages()
    await gerarRelatorioIndividual(root, buildMetrics(), new Date())

    expect(html2canvasMock.html2canvasFn).toHaveBeenCalledTimes(3)
    expect(jsPdfMock.addImageFn).toHaveBeenCalledTimes(3)
    // addPage chamado entre paginas — n-1 vezes
    expect(jsPdfMock.addPageFn).toHaveBeenCalledTimes(2)
  })

  it('chama setProperties com strings vazias (T-08-01 metadata strip)', async () => {
    const root = buildRootElWith3Pages()
    await gerarRelatorioIndividual(root, buildMetrics(), new Date())

    expect(setPropertiesFn).toHaveBeenCalledTimes(1)
    expect(setPropertiesFn).toHaveBeenCalledWith({
      title: '',
      author: '',
      creator: '',
      subject: '',
      keywords: '',
    })
  })

  it('save() chamado com filename desempenho_<slug>_<periodo>.pdf', async () => {
    const root = buildRootElWith3Pages()
    await gerarRelatorioIndividual(root, buildMetrics(), new Date())

    expect(jsPdfMock.saveFn).toHaveBeenCalledTimes(1)
    expect(jsPdfMock.savedFiles[0]).toBe('desempenho_joao-da-silva_2026-q1.pdf')
  })

  it('restaura classe dark mesmo quando html2canvas lanca (Pitfall 5)', async () => {
    document.documentElement.classList.add('dark')
    const root = buildRootElWith3Pages()
    html2canvasMock.html2canvasFn.mockImplementationOnce(() =>
      Promise.reject(new Error('canvas tainted')),
    )

    await expect(gerarRelatorioIndividual(root, buildMetrics(), new Date())).rejects.toThrow(
      'canvas tainted',
    )

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })
})

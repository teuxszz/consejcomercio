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

import { gerarRelatorioIndividual, gerarRelatorioEquipe } from '../pdf-export'
import type { DesempenhoConsultorTeam } from '@/types'

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

// ─── gerarRelatorioEquipe (Plan 04 Task 2) ─────────────────────────────────

function consultorTeamFix(id: string, nome: string, conv = 1): DesempenhoConsultorTeam {
  return {
    perfilId: id,
    perfilNome: nome,
    metricas: {
      perfilId: id,
      perfilNome: nome,
      periodo: { year: 2026, granularity: 'total' },
      leads_criados: 5,
      convertidos: conv,
      perdidos: 1,
      ciclo_medio_dias: 10,
      win_rate: 50,
      icp_fit_medio: 60,
      tarefas_concluidas: 3,
      nps_medio: 8,
    },
  }
}

function buildSinglePageRoot(): HTMLElement {
  const root = document.createElement('div')
  const page = document.createElement('div')
  page.setAttribute('data-pdf-page', '1')
  root.appendChild(page)
  document.body.appendChild(root)
  return root
}

describe('gerarRelatorioEquipe', () => {
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

  it('captura capa + N consultores + ranking (1 + N + 1 paginas)', async () => {
    const totais = buildMetrics()
    const c1: DesempenhoConsultorTeam & { leads: never[]; tarefas: never[] } = {
      ...consultorTeamFix('p1', 'Alice'),
      leads: [],
      tarefas: [],
    }
    const c2 = { ...consultorTeamFix('p2', 'Beto'), leads: [], tarefas: [] }
    const controller = new AbortController()

    await gerarRelatorioEquipe({
      totais,
      consultoresAtivos: [c1, c2],
      ranking: [c1, c2],
      periodoLabel: 'Ano 2026',
      periodoSlug: '2026-total',
      mountAndCapture: async () => buildSinglePageRoot(),
      onProgress: () => {},
      signal: controller.signal,
    })

    // 1 capa + 2 consultores + 1 ranking = 4 capturas
    expect(html2canvasMock.html2canvasFn).toHaveBeenCalledTimes(4)
    expect(jsPdfMock.addImageFn).toHaveBeenCalledTimes(4)
    // addPage chamado para consultor 1, consultor 2, ranking = 3 vezes
    expect(jsPdfMock.addPageFn).toHaveBeenCalledTimes(3)
    expect(jsPdfMock.saveFn).toHaveBeenCalledWith('desempenho_equipe_2026-total.pdf')
  })

  it('strip metadata default (T-08-01)', async () => {
    const controller = new AbortController()
    await gerarRelatorioEquipe({
      totais: buildMetrics(),
      consultoresAtivos: [],
      ranking: [],
      periodoLabel: 'Ano 2026',
      periodoSlug: '2026-total',
      mountAndCapture: async () => buildSinglePageRoot(),
      onProgress: () => {},
      signal: controller.signal,
    })
    expect(setPropertiesFn).toHaveBeenCalledWith({
      title: '',
      author: '',
      creator: '',
      subject: '',
      keywords: '',
    })
  })

  it('respeita AbortSignal: throw AbortError mid-loop', async () => {
    const controller = new AbortController()
    const c1 = { ...consultorTeamFix('p1', 'Alice'), leads: [], tarefas: [] }
    const c2 = { ...consultorTeamFix('p2', 'Beto'), leads: [], tarefas: [] }

    // Aborta apos a capa, antes do primeiro consultor
    let calls = 0
    const mountAndCapture = async () => {
      calls++
      if (calls === 1) controller.abort()
      return buildSinglePageRoot()
    }

    await expect(
      gerarRelatorioEquipe({
        totais: buildMetrics(),
        consultoresAtivos: [c1, c2],
        ranking: [c1, c2],
        periodoLabel: 'Ano 2026',
        periodoSlug: '2026-total',
        mountAndCapture,
        onProgress: () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow('Aborted')

    // save NAO foi chamado pois abortou
    expect(jsPdfMock.saveFn).not.toHaveBeenCalled()
  })

  it('restaura tema dark apos AbortError (Pitfall 5 / UAT bonus 8)', async () => {
    document.documentElement.classList.add('dark')
    const controller = new AbortController()
    const c1 = { ...consultorTeamFix('p1', 'Alice'), leads: [], tarefas: [] }

    let calls = 0
    const mountAndCapture = async () => {
      calls++
      if (calls === 1) controller.abort()
      return buildSinglePageRoot()
    }

    await expect(
      gerarRelatorioEquipe({
        totais: buildMetrics(),
        consultoresAtivos: [c1],
        ranking: [c1],
        periodoLabel: 'Ano 2026',
        periodoSlug: '2026-total',
        mountAndCapture,
        onProgress: () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow()

    // theme restaurado mesmo com abort
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })
})

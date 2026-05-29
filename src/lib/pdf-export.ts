// Phase 8 (Plan 03) — Geracao de PDF do relatorio individual de desempenho.
//
// D-01 RESEARCH §Pattern 3 + §Pattern 6 + §Pattern 11:
//   - Lazy import jspdf + html2canvas (chunks separados via Vite — A8)
//   - Captura cada div `[data-pdf-page]` do DesempenhoReport (Plan 02)
//     individualmente em scale=2 + backgroundColor branco
//   - Theme dark forçado a light durante captura, restaurado em finally
//     (Pitfall 5 — falha durante captura nao deixa user com tema quebrado)
//   - Strip de metadata default do jspdf (T-08-01) — sem leak de creator/title
//   - Memory release explicit em iOS (Pitfall 7) — canvas.width = 0
//
// Filename: `desempenho_<slug>_<year>-<granularity>.pdf` (T-08-02 — slug
// elimina path-traversal e chars especiais).
//
// Nao depende de jsdom canvas: implementacao real roda apenas em browser; em
// testes, mocks de jspdf+html2canvas substituem (ver src/test/pdf-mocks.ts).

import type { DesempenhoMetricas, DesempenhoConsultorTeam, Lead, Tarefa } from '@/types'
import { slugify } from './slug'

const A4_MM_W = 210
const A4_MM_H = 297

/** Info de progresso para team-report (Plan 04) renderizar barra de status. */
export interface ProgressInfo {
  current: number
  total: number
  consultorNome: string
}

/**
 * Gera o PDF do relatorio individual a partir do DOM ja renderizado de
 * `DesempenhoReport`. O caller e responsavel por montar/desmontar o componente
 * — esta funcao apenas captura `rootEl.querySelectorAll('[data-pdf-page]')`.
 *
 * @param rootEl    elemento raiz montado em portal (`[data-pdf-root]`)
 * @param metrics   metricas (usadas para compor filename)
 * @param _geradoEm timestamp do snapshot — passado para alinhar com Plan 04
 *                  (atualmente nao usado dentro desta funcao, mas mantemos a
 *                  assinatura para a Plan 04 team-report consumir)
 */
export async function gerarRelatorioIndividual(
  rootEl: HTMLElement,
  metrics: DesempenhoMetricas,
  _geradoEm: Date,
): Promise<void> {
  // Lazy import — Vite emite chunks separados jspdf-*.js + html2canvas-*.js
  // (verificado em build no Task 3 — A8 RESEARCH).
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])

  const html = document.documentElement
  const wasDark = html.classList.contains('dark')

  if (wasDark) {
    html.classList.remove('dark')
    html.classList.add('light')
  }

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // T-08-01 (Information Disclosure): strip metadata default do jspdf
    // (sem leak de creator='jsPDF' / title='').
    pdf.setProperties({
      title: '',
      author: '',
      creator: '',
      subject: '',
      keywords: '',
    })

    // 1 RAF wait — garante paint apos remocao de dark/aplicacao de light
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))

    const pages = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-pdf-page]'))

    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')

      if (i > 0) pdf.addPage('a4', 'portrait')
      pdf.addImage(imgData, 'PNG', 0, 0, A4_MM_W, A4_MM_H, undefined, 'FAST')

      // Pitfall 7 (iOS memory) — release canvas backing buffer
      canvas.width = 0
      canvas.height = 0
    }

    const periodo = `${metrics.periodo.year}-${metrics.periodo.granularity}`
    const filename = `desempenho_${slugify(metrics.perfilNome)}_${periodo}.pdf`
    pdf.save(filename)
  } finally {
    if (wasDark) {
      html.classList.remove('light')
      html.classList.add('dark')
    }
  }
}

// ─── Phase 8 Plan 04 (D-07 + Pattern 4) — Team report ──────────────────────
//
// gerarRelatorioEquipe orquestra a captura sequencial:
//   1. Capa (totais equipe)
//   2. Loop por consultor ativo (1 pagina cada) — checa AbortSignal entre
//      iteracoes (Pattern 4 RESEARCH + Pitfall 5)
//   3. Pagina final de ranking
//
// O caller fornece `mountAndCapture(variant, data)` — async fn que renderiza
// o DesempenhoTeamReport off-screen, aguarda RAF para paint, e devolve o
// HTMLElement raiz `[data-pdf-root]`. Essa indirecao permite que o React
// state do parent dirija a montagem/desmontagem entre variants.
//
// Theme: try/finally restaura dark mesmo apos AbortError (Pitfall 5 — UAT 8).
// Metadata: setProperties({}) idem ao individual (T-08-01).

export interface ConsultorComDados extends DesempenhoConsultorTeam {
  leads: Lead[]
  tarefas: Tarefa[]
}

export interface GerarRelatorioEquipeInput {
  totais: DesempenhoMetricas
  consultoresAtivos: ConsultorComDados[]
  ranking: DesempenhoConsultorTeam[]
  periodoLabel: string
  /** Filename slug do periodo, e.g. "2026-total". */
  periodoSlug: string
  mountAndCapture: (
    variant: 'capa' | 'consultor' | 'ranking',
    data: { totais?: DesempenhoMetricas; consultor?: ConsultorComDados; ranking?: DesempenhoConsultorTeam[] },
  ) => Promise<HTMLElement>
  onProgress: (info: ProgressInfo) => void
  signal: AbortSignal
}

export async function gerarRelatorioEquipe(input: GerarRelatorioEquipeInput): Promise<void> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])

  const html = document.documentElement
  const wasDark = html.classList.contains('dark')

  if (wasDark) {
    html.classList.remove('dark')
    html.classList.add('light')
  }

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // T-08-01 — strip metadata default do jspdf
    pdf.setProperties({
      title: '',
      author: '',
      creator: '',
      subject: '',
      keywords: '',
    })

    async function capturarPagina(rootEl: HTMLElement, addPage: boolean) {
      // Garantir 1 frame de paint apos mount
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
      const pageEl = rootEl.querySelector<HTMLElement>('[data-pdf-page]') ?? rootEl
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
      if (addPage) pdf.addPage('a4', 'portrait')
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, A4_MM_W, A4_MM_H, undefined, 'FAST')
      // Pitfall 7 — release iOS canvas memory
      canvas.width = 0
      canvas.height = 0
    }

    // ── Capa ────────────────────────────────────────────────────────────────
    input.onProgress({ current: 0, total: input.consultoresAtivos.length, consultorNome: 'Capa' })
    const capaEl = await input.mountAndCapture('capa', { totais: input.totais })
    await capturarPagina(capaEl, false)

    // ── Loop consultores ────────────────────────────────────────────────────
    for (let i = 0; i < input.consultoresAtivos.length; i++) {
      if (input.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const consultor = input.consultoresAtivos[i]
      input.onProgress({
        current: i + 1,
        total: input.consultoresAtivos.length,
        consultorNome: consultor.perfilNome,
      })
      const el = await input.mountAndCapture('consultor', { consultor })
      await capturarPagina(el, true)
    }

    // ── Ranking ─────────────────────────────────────────────────────────────
    if (input.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    input.onProgress({
      current: input.consultoresAtivos.length,
      total: input.consultoresAtivos.length,
      consultorNome: 'Ranking',
    })
    const rankingEl = await input.mountAndCapture('ranking', { ranking: input.ranking })
    await capturarPagina(rankingEl, true)

    pdf.save(`desempenho_equipe_${input.periodoSlug}.pdf`)
  } finally {
    if (wasDark) {
      html.classList.remove('light')
      html.classList.add('dark')
    }
  }
}

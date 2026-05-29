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

import type { DesempenhoMetricas } from '@/types'
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

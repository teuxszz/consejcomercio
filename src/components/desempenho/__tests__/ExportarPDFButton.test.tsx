// Stub criado em Plan 08-01 Wave 0. Tests reais sao implementados em Plan 08-03
// (slice export). O describe.skip cumpre o requisito Wave 0 (arquivo presente)
// sem falhar a suite enquanto o componente ainda nao existe.
//
// Quando 08-03 implementar ExportarPDFButton, substituir por describe(...) com:
//   - click → setExportando(true) → spinner inline
//   - sucesso → toast 'PDF gerado' + setExportando(false)
//   - falha → toast.error com mensagem + recupera estado
//   - usa mockJsPdf + mockHtml2canvas + mockBlobUrlAndAnchor de @/test/pdf-mocks

import { describe, it } from 'vitest'

describe.skip('ExportarPDFButton (TODO: implementar em Plan 08-03)', () => {
  it.skip('mostra spinner durante exportacao', () => {})
  it.skip('chama gerarRelatorioIndividual com metricas + rootEl', () => {})
  it.skip('toast de sucesso apos save do PDF', () => {})
  it.skip('toast de erro quando html2canvas falha', () => {})
})

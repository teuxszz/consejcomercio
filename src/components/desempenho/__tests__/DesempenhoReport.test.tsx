// Stub criado em Plan 08-01 Wave 0. Tests reais sao implementados em Plan 08-02
// (slice page + render). O describe.skip cumpre o requisito Wave 0 (arquivo
// presente) sem falhar a suite enquanto src/components/desempenho/DesempenhoReport.tsx
// ainda nao existe.
//
// Quando 08-02 implementar o renderer, substituir por describe(...) com:
//   - 3 sub-divs `data-pdf-page="1|2|3"` montadas em portal off-screen
//   - KPI grid 4x2 com as 8 metricas
//   - charts com isAnimationActive={false} (Pitfall 1 RESEARCH)
//   - container raiz com background:white para captura em light theme

import { describe, it } from 'vitest'

describe.skip('DesempenhoReport (TODO: implementar em Plan 08-02)', () => {
  it.skip('renderiza KPI grid 4x2 com as 8 metricas', () => {})
  it.skip('charts recebem isAnimationActive={false}', () => {})
  it.skip('container raiz e portal off-screen com background branco', () => {})
})

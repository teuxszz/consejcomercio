// Phase 8 (Plan 03 Task 1) — Stub mantido. O teste real do componente esta
// na Task 3 (apos componente existir). O teste isolado de pdf-export.ts esta
// em src/lib/__tests__/pdf-export.test.ts (lazy import + setProperties +
// theme restore).
//
// Esta decisao segue a "alternativa" explicita do PLAN Task 1: testes do
// componente UI ficam no .test.tsx, testes da pure-fn ficam no .test.ts
// dedicado. Stub vazio enquanto componente nao monta — substituido na Task 3.

import { describe, it } from 'vitest'

describe.skip('ExportarPDFButton (componente — implementado na Task 3)', () => {
  it.skip('renderiza com texto Exportar PDF', () => {})
  it.skip('chama gerarRelatorioIndividual e dispara toast.success', () => {})
  it.skip('toast.error quando export falha', () => {})
})

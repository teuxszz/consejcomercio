// Stub criado em Plan 08-01 Wave 0. Tests reais sao implementados em Plan 08-03
// (slice export). O describe.skip cumpre o requisito Wave 0 (arquivo presente)
// sem falhar a suite enquanto src/lib/csv-export.ts ainda nao existe.
//
// Quando 08-03 implementar csv-export.ts, este describe.skip deve ser
// substituido por describe(...) e os it.skip por it(...) reais cobrindo:
//   - UTF-8 BOM no inicio de cada CSV
//   - papaparse.unparse chamado com { quotes: true }
//   - sanitizeCell prefixa `=` `+` `-` `@` com apostrofo (T-08-03)
//   - 3 entries no ZIP: leads.csv, tarefas.csv, contratos.csv
//   - URL.createObjectURL + revokeObjectURL invocados (T-08-08)

import { describe, it } from 'vitest'

describe.skip('csv-export (TODO: implementar em Plan 08-03)', () => {
  it.skip('gerarZipCSV inclui leads.csv, tarefas.csv, contratos.csv', () => {})
  it.skip('cada CSV comeca com UTF-8 BOM', () => {})
  it.skip('sanitizeCell mitiga CSV injection (T-08-03)', () => {})
  it.skip('URL.createObjectURL revogado apos download (T-08-08)', () => {})
})

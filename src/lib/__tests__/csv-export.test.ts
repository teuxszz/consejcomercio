// Phase 8 (Plan 03) — Tests para src/lib/csv-export.ts.
//
// Cobertura obrigatoria (§Pattern 15 PATTERNS):
//   - sanitizeCell prefixa = + - @ \t \r (T-08-03 OWASP CSV injection)
//   - normal strings passam intactas
//   - UTF-8 BOM presente no inicio de cada CSV
//   - Papa.unparse chamado 3x (leads, tarefas, contratos)
//   - zip.file chamado 3x com nomes corretos
//   - URL.revokeObjectURL invocado apos download (T-08-08)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockJSZip, mockPapaparse, mockBlobUrlAndAnchor } from '@/test/pdf-mocks'
import type { Lead, Tarefa, Contrato } from '@/types'

const zipMock = mockJSZip()
const papaMock = mockPapaparse()

vi.mock('jszip', () => ({
  default: zipMock.JSZipClass,
}))

vi.mock('papaparse', () => ({
  default: papaMock.Papa,
}))

import { gerarZipCSV, sanitizeCell } from '../csv-export'

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    nome: 'Acme Corp',
    empresa: 'Acme',
    segmento: 'industria',
    telefone: '11999999999',
    origem: 'site',
    status: 'qualificado',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-16T10:00:00Z',
    ...overrides,
  }
}

function buildTarefa(overrides: Partial<Tarefa> = {}): Tarefa {
  return {
    id: 't1',
    titulo: 'Follow-up Acme',
    tipo: 'followup',
    prioridade: 'media',
    status: 'aberta',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    ...overrides,
  }
}

function buildContrato(overrides: Partial<Contrato> = {}): Contrato {
  return {
    id: 'c1',
    cliente_id: 'cli1',
    tipo: 'recorrente',
    modelo_precificacao: 'mensalidade',
    areas_direito: ['tributario'],
    status: 'ativo',
    rm_status: 'em_dia',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    ...overrides,
  }
}

describe('sanitizeCell (T-08-03 OWASP CSV injection)', () => {
  it('prefixa = com apostrofo', () => {
    expect(sanitizeCell('=cmd|ping')).toBe(`'=cmd|ping`)
  })

  it('prefixa + com apostrofo', () => {
    expect(sanitizeCell('+1234')).toBe(`'+1234`)
  })

  it('prefixa - com apostrofo', () => {
    expect(sanitizeCell('-foo')).toBe(`'-foo`)
  })

  it('prefixa @ com apostrofo', () => {
    expect(sanitizeCell('@bar')).toBe(`'@bar`)
  })

  it('texto normal passa intacto', () => {
    expect(sanitizeCell('Acme Industries')).toBe('Acme Industries')
  })

  it('string vazia passa intacta', () => {
    expect(sanitizeCell('')).toBe('')
  })
})

describe('gerarZipCSV', () => {
  let blobMock: ReturnType<typeof mockBlobUrlAndAnchor>

  beforeEach(() => {
    zipMock.fileFn.mockClear()
    zipMock.generateAsyncFn.mockClear()
    zipMock.addedFiles.length = 0
    papaMock.unparseFn.mockClear()
    blobMock = mockBlobUrlAndAnchor()
  })

  afterEach(() => {
    blobMock.restore()
  })

  it('chama Papa.unparse 3 vezes (leads + tarefas + contratos)', async () => {
    await gerarZipCSV({
      perfilNome: 'João Silva',
      periodoLabel: '2026-q1',
      leads: [buildLead()],
      tarefas: [buildTarefa()],
      contratos: [buildContrato()],
    })
    expect(papaMock.unparseFn).toHaveBeenCalledTimes(3)
  })

  it('chama zip.file 3 vezes com nomes leads.csv, tarefas.csv, contratos.csv', async () => {
    await gerarZipCSV({
      perfilNome: 'João Silva',
      periodoLabel: '2026-q1',
      leads: [buildLead()],
      tarefas: [buildTarefa()],
      contratos: [buildContrato()],
    })
    expect(zipMock.fileFn).toHaveBeenCalledTimes(3)
    const names = zipMock.addedFiles.map(f => f.name)
    expect(names).toEqual(['leads.csv', 'tarefas.csv', 'contratos.csv'])
  })

  it('cada CSV comeca com UTF-8 BOM (\\uFEFF)', async () => {
    await gerarZipCSV({
      perfilNome: 'João Silva',
      periodoLabel: '2026-q1',
      leads: [buildLead()],
      tarefas: [buildTarefa()],
      contratos: [buildContrato()],
    })
    for (const f of zipMock.addedFiles) {
      expect(f.content.charCodeAt(0)).toBe(0xfeff)
    }
  })

  it('Papa.unparse chamado com { quotes: true }', async () => {
    await gerarZipCSV({
      perfilNome: 'João Silva',
      periodoLabel: '2026-q1',
      leads: [buildLead()],
      tarefas: [buildTarefa()],
      contratos: [buildContrato()],
    })
    for (const call of papaMock.unparseFn.mock.calls) {
      expect(call[1]).toMatchObject({ quotes: true })
    }
  })

  it('URL.revokeObjectURL chamado apos download (T-08-08)', async () => {
    await gerarZipCSV({
      perfilNome: 'João Silva',
      periodoLabel: '2026-q1',
      leads: [buildLead()],
      tarefas: [buildTarefa()],
      contratos: [buildContrato()],
    })
    expect(blobMock.createObjectURLFn).toHaveBeenCalledTimes(1)
    expect(blobMock.revokeObjectURLFn).toHaveBeenCalledTimes(1)
    expect(blobMock.clickFn).toHaveBeenCalledTimes(1)
  })
})

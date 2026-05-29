import { describe, it, expect } from 'vitest'
import { groupByRoot } from '@/lib/doc-grouping'
import type { ClienteDoc } from '@/types'

function doc(partial: Partial<ClienteDoc> & { id: string }): ClienteDoc {
  return {
    cliente_id: 'c1',
    autor_id: 'p1',
    autor_tipo: 'interno',
    tag: 'proposta',
    nome_arquivo: `${partial.id}.pdf`,
    mime_type: 'application/pdf',
    tamanho_bytes: 1024,
    storage_path: `c1/${partial.id}.pdf`,
    versao: 1,
    parent_doc_id: null,
    requer_aprovacao: false,
    status: null,
    comentario_cliente: null,
    created_at: '2026-05-29T00:00:00Z',
    deleted_at: null,
    ...partial,
  }
}

describe('groupByRoot', () => {
  it('agrupa v1+v2: current=v2, history=[v1]', () => {
    const v1 = doc({ id: 'a', versao: 1, created_at: '2026-05-01T00:00:00Z' })
    const v2 = doc({ id: 'b', versao: 2, parent_doc_id: 'a', created_at: '2026-05-10T00:00:00Z' })
    const out = groupByRoot([v1, v2])
    expect(out).toHaveLength(1)
    expect(out[0].current.id).toBe('b')
    expect(out[0].history.map(d => d.id)).toEqual(['a'])
  })

  it('docs sem relação viram raízes independentes ordenadas por created_at desc', () => {
    const a = doc({ id: 'a', created_at: '2026-05-01T00:00:00Z' })
    const b = doc({ id: 'b', created_at: '2026-05-10T00:00:00Z' })
    const out = groupByRoot([a, b])
    expect(out.map(g => g.current.id)).toEqual(['b', 'a'])
    expect(out[0].history).toEqual([])
    expect(out[1].history).toEqual([])
  })

  it('órfão (parent_doc_id aponta fora da lista): doc vira root própria', () => {
    const orfao = doc({ id: 'o', versao: 2, parent_doc_id: 'inexistente' })
    const out = groupByRoot([orfao])
    expect(out).toHaveLength(1)
    expect(out[0].current.id).toBe('o')
    expect(out[0].history).toEqual([])
  })

  it('lista vazia: retorna []', () => {
    expect(groupByRoot([])).toEqual([])
  })
})

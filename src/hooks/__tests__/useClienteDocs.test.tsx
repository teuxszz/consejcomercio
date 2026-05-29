import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// ─── Mocks (must be hoisted before module imports) ──────────────────────────

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// supabase mock — encadeavel, custom per-test via setMockSupabase
// `vi.hoisted` é necessário porque `vi.mock` é hoisted para o topo do arquivo;
// sem isso o factory referencia `supabaseState` antes da inicialização.
type AnyFn = ReturnType<typeof vi.fn>
interface SupabaseMockState {
  from: AnyFn
  storage: { from: AnyFn }
  auth: { getUser: AnyFn }
}
const { supabaseState } = vi.hoisted(() => {
  const state: SupabaseMockState = {
    from: vi.fn(),
    storage: { from: vi.fn() },
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null } })) },
  }
  return { supabaseState: state }
})
vi.mock('@/lib/supabase', () => ({ supabase: supabaseState }))

// validateDocOrThrow — let it run real (rejects size > 10MB)
// storage-helpers — also let it run real (delega ao supabase.storage mock)

// ─── Imports após mocks ─────────────────────────────────────────────────────

import { useClienteDocs, useUploadClienteDoc, useDownloadDoc } from '@/hooks/useClienteDocs'
import { mockFileBuilder } from '@/test/storage-mocks'
import { toast } from 'sonner'

// ─── Wrapper ────────────────────────────────────────────────────────────────

function wrapper(qc: QueryClient) {
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function freshQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

// Helpers para montar query-builder thenable que retorna {data, error}.
function builderResolving(response: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {}
  const chain = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'is', 'order']
  for (const m of chain) b[m] = vi.fn(() => b)
  b.single = vi.fn(() => Promise.resolve(response))
  b.maybeSingle = vi.fn(() => Promise.resolve(response))
  b.then = (resolve: (v: typeof response) => unknown) => resolve(response)
  return b
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  supabaseState.from.mockReset()
  supabaseState.storage.from.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── useClienteDocs (query) ─────────────────────────────────────────────────

describe('useClienteDocs (query)', () => {
  it('lista docs por cliente filtrando deleted_at IS NULL', async () => {
    const docs = [{ id: 'd1', cliente_id: 'c1', nome_arquivo: 'a.pdf' }]
    const builder = builderResolving({ data: docs, error: null })
    supabaseState.from.mockImplementation(() => builder)

    const qc = freshQc()
    const { result } = renderHook(() => useClienteDocs('c1'), { wrapper: wrapper(qc) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(docs)
    expect(supabaseState.from).toHaveBeenCalledWith('cliente_docs')
    expect(builder.eq).toHaveBeenCalledWith('cliente_id', 'c1')
    expect(builder.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('clienteId=null: enabled=false (não query)', async () => {
    supabaseState.from.mockImplementation(() => builderResolving({ data: [], error: null }))
    const qc = freshQc()
    const { result } = renderHook(() => useClienteDocs(null), { wrapper: wrapper(qc) })

    // pequeno tick para garantir que o hook não disparou query
    await new Promise(r => setTimeout(r, 10))
    expect(result.current.isFetching).toBe(false)
    expect(supabaseState.from).not.toHaveBeenCalled()
  })
})

// ─── useUploadClienteDoc ────────────────────────────────────────────────────

describe('useUploadClienteDoc (mutation)', () => {
  it('happy path: INSERT row → upload storage → UPDATE storage_path → returns docId', async () => {
    const insertedRow = { id: 'doc-uuid-1' }
    const fromBuilder = builderResolving({ data: insertedRow, error: null })
    supabaseState.from.mockImplementation(() => fromBuilder)

    const uploadFn = vi.fn(() => Promise.resolve({ error: null }))
    supabaseState.storage.from.mockImplementation(() => ({ upload: uploadFn }))

    const qc = freshQc()
    const { result } = renderHook(() => useUploadClienteDoc(), { wrapper: wrapper(qc) })

    const file = mockFileBuilder({ size: 1024, type: 'application/pdf', name: 'oferta.pdf' })

    let returned: string | undefined
    await act(async () => {
      returned = await result.current.mutateAsync({
        clienteId: 'c1',
        file,
        tag: 'proposta',
        requerAprovacao: true,
        autorId: 'p1',
        autorTipo: 'interno',
      })
    })

    expect(returned).toBe('doc-uuid-1')
    expect(fromBuilder.insert).toHaveBeenCalledTimes(1)
    expect(uploadFn).toHaveBeenCalledWith(
      'c1/doc-uuid-1.pdf',
      file,
      expect.objectContaining({ upsert: false })
    )
    // UPDATE storage_path
    expect(fromBuilder.update).toHaveBeenCalledWith({ storage_path: 'c1/doc-uuid-1.pdf' })
    expect(toast.success).toHaveBeenCalledWith('Documento enviado')
  })

  it('validation fail (size > 10MB): toast erro PT-BR; sem INSERT', async () => {
    const fromBuilder = builderResolving({ data: { id: 'X' }, error: null })
    supabaseState.from.mockImplementation(() => fromBuilder)
    const uploadFn = vi.fn(() => Promise.resolve({ error: null }))
    supabaseState.storage.from.mockImplementation(() => ({ upload: uploadFn }))

    const qc = freshQc()
    const { result } = renderHook(() => useUploadClienteDoc(), { wrapper: wrapper(qc) })

    const bigFile = mockFileBuilder({ size: 11 * 1024 * 1024, type: 'application/pdf', name: 'big.pdf' })

    await act(async () => {
      try {
        await result.current.mutateAsync({
          clienteId: 'c1',
          file: bigFile,
          tag: 'proposta',
          requerAprovacao: false,
          autorId: 'p1',
          autorTipo: 'interno',
        })
      } catch {/* expected */}
    })

    expect(uploadFn).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Arquivo maior que 10 MB')
  })

  it('upload fail: rollback DELETE da row + rethrow', async () => {
    const insertedRow = { id: 'doc-rollback' }
    const fromBuilder = builderResolving({ data: insertedRow, error: null })
    supabaseState.from.mockImplementation(() => fromBuilder)

    const uploadFn = vi.fn(() => Promise.resolve({ error: { message: 'storage 500' } }))
    supabaseState.storage.from.mockImplementation(() => ({ upload: uploadFn }))

    const qc = freshQc()
    const { result } = renderHook(() => useUploadClienteDoc(), { wrapper: wrapper(qc) })

    const file = mockFileBuilder({ size: 1024, type: 'application/pdf', name: 'r.pdf' })

    await act(async () => {
      try {
        await result.current.mutateAsync({
          clienteId: 'c1',
          file,
          tag: 'outro',
          requerAprovacao: false,
          autorId: 'p1',
          autorTipo: 'interno',
        })
      } catch {/* expected */}
    })

    expect(uploadFn).toHaveBeenCalled()
    // delete chamado no rollback
    expect(fromBuilder.delete).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('D-01 enforce: autorTipo=cliente força requer_aprovacao=false mesmo se input=true', async () => {
    const insertedRow = { id: 'doc-cli' }
    const fromBuilder = builderResolving({ data: insertedRow, error: null })
    supabaseState.from.mockImplementation(() => fromBuilder)
    const uploadFn = vi.fn(() => Promise.resolve({ error: null }))
    supabaseState.storage.from.mockImplementation(() => ({ upload: uploadFn }))

    const qc = freshQc()
    const { result } = renderHook(() => useUploadClienteDoc(), { wrapper: wrapper(qc) })

    const file = mockFileBuilder({ size: 1024, type: 'application/pdf', name: 'rg.pdf' })

    await act(async () => {
      await result.current.mutateAsync({
        clienteId: 'c1',
        file,
        tag: 'outro',
        requerAprovacao: true, // cliente tentando marcar — deve ser descartado
        autorId: 'cli-p1',
        autorTipo: 'cliente',
      })
    })

    const insertedCall = fromBuilder.insert.mock.calls[0]?.[0]
    expect(insertedCall.requer_aprovacao).toBe(false)
    expect(insertedCall.status).toBe(null) // sem aprovação => sem pending
  })

  it('D-02 sem parentDocId: versao=1, parent_doc_id=null, sem UPDATE em outra row', async () => {
    const insertedRow = { id: 'doc-v1' }
    const fromBuilder = builderResolving({ data: insertedRow, error: null })
    supabaseState.from.mockImplementation(() => fromBuilder)
    const uploadFn = vi.fn(() => Promise.resolve({ error: null }))
    supabaseState.storage.from.mockImplementation(() => ({ upload: uploadFn }))

    const qc = freshQc()
    const { result } = renderHook(() => useUploadClienteDoc(), { wrapper: wrapper(qc) })

    const file = mockFileBuilder({ size: 1024, type: 'application/pdf', name: 'a.pdf' })

    await act(async () => {
      await result.current.mutateAsync({
        clienteId: 'c1',
        file,
        tag: 'proposta',
        requerAprovacao: false,
        autorId: 'p1',
        autorTipo: 'interno',
      })
    })

    const insertedCall = fromBuilder.insert.mock.calls[0]?.[0]
    expect(insertedCall.versao).toBe(1)
    expect(insertedCall.parent_doc_id).toBe(null)
    // update foi chamado APENAS para storage_path (não para superseded)
    const updateCalls = fromBuilder.update.mock.calls
    expect(updateCalls.length).toBe(1)
    expect(updateCalls[0][0]).toEqual({ storage_path: expect.any(String) })
  })

  it('D-02 com parentDocId: SELECT parent.versao → INSERT v+1 + parent_doc_id + UPDATE parent superseded', async () => {
    // Sequência de chamadas em supabase.from:
    //   1. .select('versao').eq('id', parent).single() → { versao: 1 }
    //   2. .insert(...).select('id').single() → { id: 'doc-v2' }
    //   3. .update({ storage_path }).eq('id', 'doc-v2') → resolve void
    //   4. .update({ status: 'superseded' }).eq('id', parent).neq('status','superseded') → resolve void
    const calls: Array<Record<string, unknown>> = []
    const builderSeq = [
      builderResolving({ data: { versao: 1 }, error: null }), // SELECT parent
      builderResolving({ data: { id: 'doc-v2' }, error: null }), // INSERT new
      builderResolving({ data: null, error: null }),             // UPDATE storage_path
      builderResolving({ data: null, error: null }),             // UPDATE parent superseded
    ]
    let i = 0
    supabaseState.from.mockImplementation(() => {
      const b = builderSeq[i] ?? builderSeq[builderSeq.length - 1]
      calls.push(b)
      i++
      return b
    })

    const uploadFn = vi.fn(() => Promise.resolve({ error: null }))
    supabaseState.storage.from.mockImplementation(() => ({ upload: uploadFn }))

    const qc = freshQc()
    const { result } = renderHook(() => useUploadClienteDoc(), { wrapper: wrapper(qc) })

    const file = mockFileBuilder({ size: 1024, type: 'application/pdf', name: 'b.pdf' })

    await act(async () => {
      await result.current.mutateAsync({
        clienteId: 'c1',
        file,
        tag: 'proposta',
        requerAprovacao: true,
        autorId: 'p1',
        autorTipo: 'interno',
        parentDocId: 'doc-v1',
      })
    })

    // Builder 0 = SELECT versao em parent
    expect(calls[0].select).toHaveBeenCalledWith('versao')
    expect(calls[0].eq).toHaveBeenCalledWith('id', 'doc-v1')

    // Builder 1 = INSERT com versao=2 + parent_doc_id=doc-v1
    const insertedArg = (calls[1].insert as AnyFn).mock.calls[0][0]
    expect(insertedArg.versao).toBe(2)
    expect(insertedArg.parent_doc_id).toBe('doc-v1')

    // Builder 3 = UPDATE parent status='superseded' (idempotente)
    expect(calls[3].update).toHaveBeenCalledWith({ status: 'superseded' })
    expect(calls[3].eq).toHaveBeenCalledWith('id', 'doc-v1')
    expect(calls[3].neq).toHaveBeenCalledWith('status', 'superseded')
  })
})

// ─── useDownloadDoc ─────────────────────────────────────────────────────────

describe('useDownloadDoc (mutation)', () => {
  it('chama getSignedDownloadUrl + cria <a download> + clica + remove', async () => {
    const createSignedUrlFn = vi.fn(() =>
      Promise.resolve({ data: { signedUrl: 'https://signed.example/x' }, error: null })
    )
    supabaseState.storage.from.mockImplementation(() => ({ createSignedUrl: createSignedUrlFn }))

    const qc = freshQc()
    const { result } = renderHook(() => useDownloadDoc(), { wrapper: wrapper(qc) })

    // Spy em createElement para verificar atributos do <a> + click; criamos
    // anchor REAL (jsdom-aware) e substituímos apenas .click para spy.
    const realCreate = document.createElement.bind(document)
    const clickSpy = vi.fn()
    let createdAnchor: HTMLAnchorElement | null = null
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement
      if (tag === 'a') {
        el.click = clickSpy
        createdAnchor = el
      }
      return el
    })

    await act(async () => {
      await result.current.mutateAsync({
        id: 'd1',
        cliente_id: 'c1',
        autor_id: 'p1',
        autor_tipo: 'interno',
        tag: 'proposta',
        nome_arquivo: 'oferta.pdf',
        mime_type: 'application/pdf',
        tamanho_bytes: 1024,
        storage_path: 'c1/d1.pdf',
        versao: 1,
        parent_doc_id: null,
        requer_aprovacao: false,
        status: null,
        comentario_cliente: null,
        created_at: '2026-05-29T00:00:00Z',
        deleted_at: null,
      })
    })

    expect(createSignedUrlFn).toHaveBeenCalledWith('c1/d1.pdf', 3600)
    expect(createdAnchor).not.toBeNull()
    expect(createdAnchor!.href).toBe('https://signed.example/x')
    expect(createdAnchor!.download).toBe('oferta.pdf')
    expect(clickSpy).toHaveBeenCalled()
    // anchor foi removido do DOM após o click
    expect(document.body.contains(createdAnchor)).toBe(false)
    createSpy.mockRestore()
  })
})

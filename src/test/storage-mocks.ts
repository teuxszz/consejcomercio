import { vi } from 'vitest'

// Mock helpers para Supabase Storage usados em Phase 7 (cliente_docs).
//
// Cada helper instala stubs em locais relevantes (módulo `@/lib/supabase`
// quando aplicável) ou apenas retorna `vi.fn()` builders que podem ser
// passados ao mock do supabase. Style espelhado de `src/test/push-mocks.ts`
// — factory functions vi.fn-based, sem efeitos colaterais até o helper ser
// chamado por um teste.
//
// Uso:
//   import { mockSupabaseStorageUpload, mockSupabaseStorageSignedUrl, mockFileBuilder } from '@/test/storage-mocks'
//
//   beforeEach(() => {
//     const { restore } = mockSupabaseStorageUpload({ shouldFail: false })
//     restorers.push(restore)
//   })
//   afterEach(() => { restorers.forEach(r => r()); restorers.length = 0 })

type Restore = () => void

export interface MockUploadOptions {
  /** Se true, upload retorna `{ data: null, error: { message: '...' } }`. */
  shouldFail?: boolean
  /** Mensagem de erro quando shouldFail=true (default: 'Upload failed'). */
  errorMessage?: string
  /** Path retornado em data.path (default: 'cliente-id/doc-id.pdf'). */
  path?: string
}

export interface MockUploadResult {
  uploadFn: ReturnType<typeof vi.fn>
  fromFn: ReturnType<typeof vi.fn>
  restore: Restore
}

/**
 * Cria stubs para `supabase.storage.from(bucket).upload(path, file, opts)`.
 * Não instala globalmente — retorna `fromFn` que pode ser usado em `vi.mock`
 * para `@/lib/supabase` no teste. Padrão role-match documentado em PATTERNS §16.
 */
export function mockSupabaseStorageUpload(opts: MockUploadOptions = {}): MockUploadResult {
  const path = opts.path ?? 'cliente-id/doc-id.pdf'
  const uploadFn = vi.fn(() => {
    if (opts.shouldFail) {
      return Promise.resolve({
        data: null,
        error: { message: opts.errorMessage ?? 'Upload failed' },
      })
    }
    return Promise.resolve({ data: { path, id: 'storage-obj-id', fullPath: `bucket/${path}` }, error: null })
  })
  const fromFn = vi.fn((_bucket: string) => ({
    upload: uploadFn,
  }))
  const restore: Restore = () => {
    uploadFn.mockReset()
    fromFn.mockReset()
  }
  return { uploadFn, fromFn, restore }
}

export interface MockSignedUrlOptions {
  /** URL retornada (default: 'https://example.supabase.co/storage/v1/signed/...'). */
  url?: string
  /** Se true, retorna error. */
  shouldFail?: boolean
}

export interface MockSignedUrlResult {
  createSignedUrlFn: ReturnType<typeof vi.fn>
  downloadFn: ReturnType<typeof vi.fn>
  fromFn: ReturnType<typeof vi.fn>
  restore: Restore
}

/**
 * Stubs para `supabase.storage.from(bucket).createSignedUrl(path, ttl)` e
 * `download(path)`. Retornados via factory para vi.mock no teste.
 */
export function mockSupabaseStorageSignedUrl(opts: MockSignedUrlOptions = {}): MockSignedUrlResult {
  const signedUrl = opts.url ?? 'https://example.supabase.co/storage/v1/signed/mock-token'
  const createSignedUrlFn = vi.fn(() => {
    if (opts.shouldFail) {
      return Promise.resolve({ data: null, error: { message: 'Signed URL failed' } })
    }
    return Promise.resolve({ data: { signedUrl }, error: null })
  })
  const downloadFn = vi.fn(() => {
    if (opts.shouldFail) {
      return Promise.resolve({ data: null, error: { message: 'Download failed' } })
    }
    const blob = new Blob(['mock pdf bytes'], { type: 'application/pdf' })
    return Promise.resolve({ data: blob, error: null })
  })
  const fromFn = vi.fn((_bucket: string) => ({
    createSignedUrl: createSignedUrlFn,
    download: downloadFn,
  }))
  const restore: Restore = () => {
    createSignedUrlFn.mockReset()
    downloadFn.mockReset()
    fromFn.mockReset()
  }
  return { createSignedUrlFn, downloadFn, fromFn, restore }
}

export interface MockFileOptions {
  size?: number
  type?: string
  name?: string
  /** Conteúdo opcional — se ausente, o Blob é preenchido com null bytes do `size`. */
  content?: BlobPart
}

/**
 * Factory para criar `File` browser-like com tamanho/tipo/nome controlados.
 * Útil para testes de file-validation, upload, dropzone.
 *
 * Em jsdom o construtor `File` existe mas `file.size` reflete o conteúdo do
 * Blob — então construímos um ArrayBuffer do tamanho pedido para que
 * `file.size` retorne o valor correto.
 */
export function mockFileBuilder(opts: MockFileOptions = {}): File {
  const name = opts.name ?? 'mock.pdf'
  const type = opts.type ?? 'application/pdf'
  const size = opts.size ?? 1024
  const content = opts.content ?? new ArrayBuffer(size)
  return new File([content], name, { type })
}

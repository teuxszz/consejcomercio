import { vi } from 'vitest'

// Mock helpers para PDF/CSV export usados em Phase 8.
//
// Style espelhado de `src/test/storage-mocks.ts` — factory functions
// vi.fn-based, sem efeitos colaterais ate o helper ser chamado por um teste.
// Cada factory retorna spies expostos no result + `restore()`.
//
// Por que esses mocks sao obrigatorios: jsdom NAO suporta <canvas> real, entao
// html2canvas e jspdf (que dependem de canvas API) precisam ser mockados em
// qualquer teste que exercite o fluxo de export. PDF generation real ocorre
// apenas em UAT manual (REP-02 sem teste automatizado).
//
// Uso:
//   import { mockJsPdf, mockHtml2canvas, mockJSZip, mockPapaparse, mockBlobUrlAndAnchor } from '@/test/pdf-mocks'
//
//   beforeEach(() => {
//     const pdf = mockJsPdf()
//     const h2c = mockHtml2canvas()
//     restorers.push(pdf.restore, h2c.restore)
//   })
//   afterEach(() => { restorers.forEach(r => r()); restorers.length = 0 })

type Restore = () => void

// ─── jsPDF ─────────────────────────────────────────────────────────────────

export interface MockJsPdfOptions {
  /** Se true, save() lanca para simular falha de download. */
  shouldFail?: boolean
}

export interface MockJsPdfResult {
  jsPDFClass: ReturnType<typeof vi.fn>
  savedFiles: string[]
  addImageFn: ReturnType<typeof vi.fn>
  addPageFn: ReturnType<typeof vi.fn>
  saveFn: ReturnType<typeof vi.fn>
  restore: Restore
}

export function mockJsPdf(opts: MockJsPdfOptions = {}): MockJsPdfResult {
  const savedFiles: string[] = []
  const addImageFn = vi.fn()
  const addPageFn = vi.fn()
  const saveFn = vi.fn((filename: string) => {
    if (opts.shouldFail) throw new Error('Save failed')
    savedFiles.push(filename)
  })
  const jsPDFClass = vi.fn(() => ({
    addImage: addImageFn,
    addPage: addPageFn,
    save: saveFn,
  }))
  const restore: Restore = () => {
    addImageFn.mockReset()
    addPageFn.mockReset()
    saveFn.mockReset()
    jsPDFClass.mockReset()
    savedFiles.length = 0
  }
  return { jsPDFClass, savedFiles, addImageFn, addPageFn, saveFn, restore }
}

// ─── html2canvas ───────────────────────────────────────────────────────────

export interface MockHtml2canvasOptions {
  /** DataURL retornado por canvas.toDataURL (default: PNG fake). */
  dataUrl?: string
  /** Se true, retorna promise rejeitada. */
  shouldFail?: boolean
}

export interface MockHtml2canvasResult {
  html2canvasFn: ReturnType<typeof vi.fn>
  toDataURLFn: ReturnType<typeof vi.fn>
  restore: Restore
}

export function mockHtml2canvas(opts: MockHtml2canvasOptions = {}): MockHtml2canvasResult {
  const dataUrl = opts.dataUrl ?? 'data:image/png;base64,FAKE'
  const toDataURLFn = vi.fn(() => dataUrl)
  const html2canvasFn = vi.fn(() => {
    if (opts.shouldFail) {
      return Promise.reject(new Error('html2canvas failed'))
    }
    // Canvas fake — apenas o necessario para o consumer (toDataURL + width/height para release).
    return Promise.resolve({
      toDataURL: toDataURLFn,
      width: 794,
      height: 1123,
    } as unknown as HTMLCanvasElement)
  })
  const restore: Restore = () => {
    html2canvasFn.mockReset()
    toDataURLFn.mockReset()
  }
  return { html2canvasFn, toDataURLFn, restore }
}

// ─── JSZip ─────────────────────────────────────────────────────────────────

export interface MockJSZipOptions {
  /** Se true, generateAsync rejeita. */
  shouldFail?: boolean
}

export interface MockJSZipResult {
  JSZipClass: ReturnType<typeof vi.fn>
  addedFiles: Array<{ name: string; content: string }>
  generatedBlob: Blob | null
  fileFn: ReturnType<typeof vi.fn>
  generateAsyncFn: ReturnType<typeof vi.fn>
  restore: Restore
}

export function mockJSZip(opts: MockJSZipOptions = {}): MockJSZipResult {
  const addedFiles: Array<{ name: string; content: string }> = []
  let generatedBlob: Blob | null = null
  const fileFn = vi.fn((name: string, content: string) => {
    addedFiles.push({ name, content })
  })
  const generateAsyncFn = vi.fn(() => {
    if (opts.shouldFail) return Promise.reject(new Error('zip generation failed'))
    generatedBlob = new Blob(['zip-bytes-fake'], { type: 'application/zip' })
    return Promise.resolve(generatedBlob)
  })
  const JSZipClass = vi.fn(() => ({
    file: fileFn,
    generateAsync: generateAsyncFn,
  }))
  const restore: Restore = () => {
    fileFn.mockReset()
    generateAsyncFn.mockReset()
    JSZipClass.mockReset()
    addedFiles.length = 0
    generatedBlob = null
  }
  return {
    JSZipClass,
    addedFiles,
    get generatedBlob() { return generatedBlob },
    fileFn,
    generateAsyncFn,
    restore,
  } as MockJSZipResult
}

// ─── papaparse ─────────────────────────────────────────────────────────────

export interface MockPapaparseOptions {
  /** Implementacao customizada de unparse — default retorna join semicolon dos values. */
  unparseImpl?: (data: unknown[], config?: unknown) => string
}

export interface MockPapaparseResult {
  Papa: { unparse: ReturnType<typeof vi.fn> }
  unparseFn: ReturnType<typeof vi.fn>
  restore: Restore
}

export function mockPapaparse(opts: MockPapaparseOptions = {}): MockPapaparseResult {
  const unparseFn = vi.fn(opts.unparseImpl ?? ((data: unknown[]) => {
    // Default: representacao previsivel para asserts
    return `mock-csv-rows-${Array.isArray(data) ? data.length : 0}`
  }))
  const Papa = { unparse: unparseFn }
  const restore: Restore = () => {
    unparseFn.mockReset()
  }
  return { Papa, unparseFn, restore }
}

// ─── Blob URL + anchor.click (jsdom shims) ─────────────────────────────────

export interface MockBlobUrlAndAnchorResult {
  createObjectURLFn: ReturnType<typeof vi.fn>
  revokeObjectURLFn: ReturnType<typeof vi.fn>
  clickFn: ReturnType<typeof vi.fn>
  restore: Restore
}

/**
 * jsdom nao implementa URL.createObjectURL / revokeObjectURL nem
 * HTMLAnchorElement.click (em alguns ambientes). Instala spies globais que
 * registram chamadas — necessario para asserts de fluxo de download.
 */
export function mockBlobUrlAndAnchor(): MockBlobUrlAndAnchorResult {
  const createObjectURLFn = vi.fn(() => 'blob:mock-url')
  const revokeObjectURLFn = vi.fn()
  const clickFn = vi.fn()

  const origCreate = URL.createObjectURL
  const origRevoke = URL.revokeObjectURL
  const origClick = HTMLAnchorElement.prototype.click
  URL.createObjectURL = createObjectURLFn as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = revokeObjectURLFn as unknown as typeof URL.revokeObjectURL
  HTMLAnchorElement.prototype.click = clickFn as unknown as typeof HTMLAnchorElement.prototype.click

  const restore: Restore = () => {
    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
    HTMLAnchorElement.prototype.click = origClick
    createObjectURLFn.mockReset()
    revokeObjectURLFn.mockReset()
    clickFn.mockReset()
  }
  return { createObjectURLFn, revokeObjectURLFn, clickFn, restore }
}

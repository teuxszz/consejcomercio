import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const { dropzoneState } = vi.hoisted(() => {
  // dropzoneState será sobrescrito por cada teste; o factory devolve o objeto
  // mutável que useDropzone retornará.
  const state = {
    lastOptions: null as null | {
      onDropAccepted?: (files: File[]) => void
      onDropRejected?: (rejections: Array<{ errors: Array<{ code: string; message: string }> }>) => void
      disabled?: boolean
    },
  }
  return { dropzoneState: state }
})

vi.mock('react-dropzone', () => ({
  useDropzone: (opts: NonNullable<typeof dropzoneState.lastOptions>) => {
    dropzoneState.lastOptions = opts
    return {
      getRootProps: () => ({ 'data-testid': 'dropzone-root' }),
      getInputProps: () => ({ 'data-testid': 'dropzone-input' }),
      isDragActive: false,
      isDragReject: false,
    }
  },
}))

// ─── Imports após mocks ─────────────────────────────────────────────────────

import { UploadDropzone } from '@/components/clientes/UploadDropzone'
import { toast } from 'sonner'

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  dropzoneState.lastOptions = null
})

describe('UploadDropzone', () => {
  it('renderiza zona de drop com placeholder PT-BR', () => {
    render(<UploadDropzone onFiles={vi.fn()} />)
    expect(screen.getByText(/Arraste arquivos ou clique para selecionar/i)).toBeInTheDocument()
  })

  it('renderiza hint de MIME types em PT-BR', () => {
    render(<UploadDropzone onFiles={vi.fn()} />)
    expect(
      screen.getByText(/PDF, DOCX, DOC, ODT, JPG, PNG, WebP — até 10 MB/i)
    ).toBeInTheDocument()
  })

  it('onDropAccepted chama onFiles com array de Files', () => {
    const onFiles = vi.fn()
    render(<UploadDropzone onFiles={onFiles} />)

    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    dropzoneState.lastOptions?.onDropAccepted?.([file])
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('onDropRejected (size): toast.error "Arquivo maior que 10 MB"', () => {
    render(<UploadDropzone onFiles={vi.fn()} />)
    dropzoneState.lastOptions?.onDropRejected?.([
      { errors: [{ code: 'file-too-large', message: 'too large' }] },
    ])
    expect(toast.error).toHaveBeenCalledWith('Arquivo maior que 10 MB')
  })

  it('onDropRejected (mime): toast.error "Tipo não permitido…"', () => {
    render(<UploadDropzone onFiles={vi.fn()} />)
    dropzoneState.lastOptions?.onDropRejected?.([
      { errors: [{ code: 'file-invalid-type', message: 'invalid' }] },
    ])
    expect(toast.error).toHaveBeenCalledWith(
      'Tipo não permitido (use PDF, DOCX, DOC, ODT ou imagem)'
    )
  })

  it('disabled=true: passa disabled para useDropzone', () => {
    render(<UploadDropzone onFiles={vi.fn()} disabled />)
    expect(dropzoneState.lastOptions?.disabled).toBe(true)
  })
})

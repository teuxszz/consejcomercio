import { useDropzone } from 'react-dropzone'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ACCEPT com fallback de extensão por mime — Pitfall §8 RESEARCH: Windows pode
// reportar .docx como `application/octet-stream`; manter a extensão como rede
// de segurança garante o accept correto.
const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB (D-05)

interface Props {
  onFiles: (files: File[]) => void
  multiple?: boolean
  disabled?: boolean
}

export function UploadDropzone({ onFiles, multiple = true, disabled = false }: Props) {
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: ACCEPT,
    maxSize: MAX_SIZE,
    multiple,
    disabled,
    onDropRejected: rejections => {
      const first = rejections[0]?.errors[0]
      if (first?.code === 'file-too-large') {
        toast.error('Arquivo maior que 10 MB')
      } else if (first?.code === 'file-invalid-type') {
        toast.error('Tipo não permitido (use PDF, DOCX, DOC, ODT ou imagem)')
      } else {
        toast.error(first?.message ?? 'Arquivo rejeitado')
      }
    },
    onDropAccepted: files => onFiles(files),
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
        isDragActive && !isDragReject && 'border-primary bg-primary/5',
        isDragReject && 'border-destructive bg-destructive/5',
        !isDragActive && 'border-muted hover:border-primary/50',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
      aria-disabled={disabled}
    >
      <input {...getInputProps()} aria-label="Selecionar documentos" />
      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
      <p className="text-sm text-foreground">
        {isDragActive ? 'Solte para subir' : 'Arraste arquivos ou clique para selecionar'}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        PDF, DOCX, DOC, ODT, JPG, PNG, WebP — até 10 MB
      </p>
    </div>
  )
}

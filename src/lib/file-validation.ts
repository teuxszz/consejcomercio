// Validação client-side de arquivos para upload em cliente_docs (Phase 7 D-05).
//
// Função pura — sem dependências externas. Usada pelo Dropzone, pelo botão
// "Subir nova versão" e pelo hook useUploadClienteDoc.
//
// Política (RESEARCH §4 + D-05):
//   - Whitelist de extensões: pdf, docx, doc, odt, jpg, jpeg, png, webp
//   - Whitelist de MIME (cruzada com extensão quando file.type vier preenchido)
//   - Tamanho máximo: 10 MB
//   - Arquivo vazio (size=0) é rejeitado
//   - file.type=='' é TOLERADO — alguns browsers/extensões enviam vazio
//     (Pitfall §2 do RESEARCH). Não bloqueamos por isso; cruzamos com extensão.
//
// Backend MIME sniffing real é tech-debt aceito (T-07-04 disposition: accept).

export const ALLOWED_EXTENSIONS = [
  'pdf',
  'docx',
  'doc',
  'odt',
  'jpg',
  'jpeg',
  'png',
  'webp',
] as const

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword', // doc
  'application/vnd.oasis.opendocument.text', // odt
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const

export const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export type DocValidationCode = 'EXTENSION' | 'MIME' | 'SIZE' | 'EMPTY'

export interface DocValidationError {
  code: DocValidationCode
  message: string
}

/**
 * Retorna `null` se o arquivo passar todas as checagens, ou um
 * `DocValidationError` com mensagem PT-BR pronta para `toast.error()`.
 */
export function validateDoc(file: File): DocValidationError | null {
  // 1. Vazio (catch antes do size>MAX para mensagem mais útil)
  if (file.size === 0) {
    return { code: 'EMPTY', message: 'Arquivo vazio' }
  }

  // 2. Size cap (10 MB)
  if (file.size > MAX_SIZE_BYTES) {
    return { code: 'SIZE', message: 'Arquivo maior que 10 MB' }
  }

  // 3. Extensão
  const ext = extractExtension(file.name)
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return {
      code: 'EXTENSION',
      message: ext ? `Extensão .${ext} não permitida` : 'Arquivo sem extensão',
    }
  }

  // 4. MIME — só checa se file.type vier preenchido (Pitfall §2)
  if (file.type !== '' && !ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      code: 'MIME',
      message: `Tipo MIME ${file.type} não permitido`,
    }
  }

  return null
}

/**
 * Wrapper que lança Error com a mensagem em PT-BR. Útil em mutationFn quando
 * a UI prefere capturar via try/catch em vez de retornar union types.
 */
export function validateDocOrThrow(file: File): void {
  const err = validateDoc(file)
  if (err) throw new Error(err.message)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractExtension(filename: string): string | null {
  const dot = filename.lastIndexOf('.')
  if (dot < 0 || dot === filename.length - 1) return null
  return filename.slice(dot + 1).toLowerCase()
}

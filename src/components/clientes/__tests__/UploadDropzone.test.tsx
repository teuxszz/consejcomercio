import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — Plan 03 popula.
// Cobre UploadDropzone: render zone, onFiles callback no drop válido,
// toast.error no drop rejeitado (file-validation falhou).

describe('UploadDropzone', () => {
  it.todo('renderiza zona de drop com placeholder e ícone')
  it.todo('drop com files válidos chama onFiles(files)')
  it.todo('drop com file inválido (>10MB) dispara toast.error e NÃO chama onFiles')
})

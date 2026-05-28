import { describe, it, expect } from 'vitest'
import { mockFileBuilder } from '@/test/storage-mocks'
import {
  validateDoc,
  validateDocOrThrow,
  ALLOWED_EXTENSIONS,
  MAX_SIZE_BYTES,
} from '@/lib/file-validation'

// Cobre D-05 file-validation: whitelist extensão/MIME + size <= 10MB +
// tolerância a file.type vazio (Pitfall §2 do 07-RESEARCH).

describe('validateDoc', () => {
  it('rejeita arquivo maior que 10 MB com code=SIZE', () => {
    const file = mockFileBuilder({
      size: MAX_SIZE_BYTES + 1,
      type: 'application/pdf',
      name: 'big.pdf',
    })
    const err = validateDoc(file)
    expect(err?.code).toBe('SIZE')
    expect(err?.message).toContain('10 MB')
  })

  it('rejeita extensão fora da whitelist (.exe) com code=EXTENSION', () => {
    const file = mockFileBuilder({
      size: 1024,
      type: 'application/x-msdownload',
      name: 'malware.exe',
    })
    const err = validateDoc(file)
    expect(err?.code).toBe('EXTENSION')
    expect(err?.message).toContain('.exe')
  })

  it('aceita .pdf/.docx/.jpg legítimos retornando null', () => {
    const pdf = mockFileBuilder({ size: 1024, type: 'application/pdf', name: 'proposta.pdf' })
    const docx = mockFileBuilder({
      size: 1024,
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      name: 'contrato.docx',
    })
    const jpg = mockFileBuilder({ size: 1024, type: 'image/jpeg', name: 'rg.jpg' })
    expect(validateDoc(pdf)).toBeNull()
    expect(validateDoc(docx)).toBeNull()
    expect(validateDoc(jpg)).toBeNull()
  })

  it('tolera file.type vazio (não rejeita) — Pitfall §2', () => {
    const file = mockFileBuilder({ size: 1024, type: '', name: 'doc.docx' })
    expect(validateDoc(file)).toBeNull()
  })

  it('rejeita arquivo vazio (size=0) com code=EMPTY', () => {
    const file = mockFileBuilder({ size: 0, type: 'application/pdf', name: 'empty.pdf' })
    const err = validateDoc(file)
    expect(err?.code).toBe('EMPTY')
  })

  it('rejeita MIME divergente da extensão com code=MIME', () => {
    // Extensão .pdf permitida MAS file.type informa application/zip — bloqueia
    const file = mockFileBuilder({
      size: 1024,
      type: 'application/zip',
      name: 'fake.pdf',
    })
    const err = validateDoc(file)
    expect(err?.code).toBe('MIME')
  })

  it('exporta whitelist completa de extensões esperada', () => {
    // Smoke check — protege contra regressão acidental no array
    expect(ALLOWED_EXTENSIONS).toContain('pdf')
    expect(ALLOWED_EXTENSIONS).toContain('docx')
    expect(ALLOWED_EXTENSIONS).toContain('jpg')
    expect(ALLOWED_EXTENSIONS).toContain('webp')
  })
})

describe('validateDocOrThrow', () => {
  it('lança Error quando validateDoc retorna erro', () => {
    const file = mockFileBuilder({ size: 0, type: 'application/pdf', name: 'empty.pdf' })
    expect(() => validateDocOrThrow(file)).toThrow('Arquivo vazio')
  })

  it('não lança quando file é válido', () => {
    const file = mockFileBuilder({ size: 1024, type: 'application/pdf', name: 'ok.pdf' })
    expect(() => validateDocOrThrow(file)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { slugify } from '../slug'

describe('slugify', () => {
  it('strips acentos pt-BR', () => {
    expect(slugify('Conceição')).toBe('conceicao')
  })

  it('replaces spaces with dashes', () => {
    expect(slugify('João Silva')).toBe('joao-silva')
  })

  it('lowercases input', () => {
    expect(slugify('GABRIEL ARAUJO')).toBe('gabriel-araujo')
  })

  it('strips special chars and collapses runs into single dash', () => {
    expect(slugify('Maria, & "Eduarda"!')).toBe('maria-eduarda')
  })

  it('truncates to maxLen', () => {
    expect(slugify('a'.repeat(100), 10)).toHaveLength(10)
  })

  it('removes leading/trailing dashes', () => {
    expect(slugify('-foo-')).toBe('foo')
  })

  it('defaults maxLen to 48', () => {
    expect(slugify('a'.repeat(100))).toHaveLength(48)
  })

  it('returns empty string when input is only special chars', () => {
    expect(slugify('!!!@@@###')).toBe('')
  })

  it('handles path-traversal injection (T-08-02) — strips `/`, `\\`, `:`, `..`', () => {
    // Filename safety — caller pode passar perfilNome poluido
    expect(slugify('../../etc/passwd')).toBe('etc-passwd')
    expect(slugify('C:\\Windows\\System32')).toBe('c-windows-system32')
  })

  it('preserves digits', () => {
    expect(slugify('Empresa 123 LTDA')).toBe('empresa-123-ltda')
  })
})

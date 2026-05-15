import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Perfil, RoleConsej } from '../usePerfis'

// Mock do módulo usePerfis — useCurrentRole depende de useMeuPerfil.
const mockMeuPerfil = vi.fn()
vi.mock('../usePerfis', () => ({
  useMeuPerfil: () => mockMeuPerfil(),
}))

import { useCurrentRole } from '../useCurrentRole'

function comRole(role: RoleConsej | null) {
  const perfil = role
    ? ({ id: 'u1', nome: 'Teste', role, created_at: '2025-01-01' } as Perfil)
    : null
  mockMeuPerfil.mockReturnValue({ data: perfil, isLoading: false })
}

describe('useCurrentRole', () => {
  beforeEach(() => mockMeuPerfil.mockReset())

  it('diretor: isDiretor true e atinge todos os níveis', () => {
    comRole('diretor')
    const { result } = renderHook(() => useCurrentRole())
    expect(result.current.isDiretor).toBe(true)
    expect(result.current.isGerenteOrAcima).toBe(true)
    expect(result.current.isCoordenadorOrAcima).toBe(true)
    expect(result.current.atLeast('consultor')).toBe(true)
  })

  it('gerente: não é diretor, mas é gerente-ou-acima', () => {
    comRole('gerente')
    const { result } = renderHook(() => useCurrentRole())
    expect(result.current.isDiretor).toBe(false)
    expect(result.current.isGerenteOrAcima).toBe(true)
    expect(result.current.atLeast('diretor')).toBe(false)
    expect(result.current.atLeast('gerente')).toBe(true)
  })

  it('coordenador: coordenador-ou-acima mas não gerente', () => {
    comRole('coordenador')
    const { result } = renderHook(() => useCurrentRole())
    expect(result.current.isGerenteOrAcima).toBe(false)
    expect(result.current.isCoordenadorOrAcima).toBe(true)
  })

  it('consultor: nível mais baixo', () => {
    comRole('consultor')
    const { result } = renderHook(() => useCurrentRole())
    expect(result.current.isDiretor).toBe(false)
    expect(result.current.isGerenteOrAcima).toBe(false)
    expect(result.current.isCoordenadorOrAcima).toBe(false)
    expect(result.current.atLeast('consultor')).toBe(true)
  })

  it('sem role (null): tudo false, atLeast/hasRole false', () => {
    comRole(null)
    const { result } = renderHook(() => useCurrentRole())
    expect(result.current.role).toBeNull()
    expect(result.current.isDiretor).toBe(false)
    expect(result.current.atLeast('consultor')).toBe(false)
    expect(result.current.hasRole(['consultor', 'diretor'])).toBe(false)
  })

  it('hasRole verifica pertinência exata', () => {
    comRole('gerente')
    const { result } = renderHook(() => useCurrentRole())
    expect(result.current.hasRole(['gerente'])).toBe(true)
    expect(result.current.hasRole(['diretor', 'gerente'])).toBe(true)
    expect(result.current.hasRole(['diretor'])).toBe(false)
  })

  it('propaga isLoading', () => {
    mockMeuPerfil.mockReturnValue({ data: null, isLoading: true })
    const { result } = renderHook(() => useCurrentRole())
    expect(result.current.isLoading).toBe(true)
  })
})

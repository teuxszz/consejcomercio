import { describe, it, expect } from 'vitest'
import {
  cn,
  formatCurrency,
  formatDate,
  getContractProgress,
  getDaysUntilExpiry,
  getUFFromPhone,
  getInitials,
} from '../utils'

describe('cn', () => {
  it('combina classes e resolve conflitos do tailwind-merge', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    const oculto = false as boolean
    expect(cn('text-sm', oculto && 'hidden', 'font-bold')).toBe('text-sm font-bold')
  })
})

describe('formatCurrency', () => {
  it('formata número como BRL', () => {
    const out = formatCurrency(1234.5)
    expect(out).toContain('R$')
    expect(out).toContain('1.234,50')
  })
  it('null/undefined viram travessão', () => {
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency(undefined)).toBe('—')
  })
  it('zero formata como R$ 0,00 (não travessão)', () => {
    expect(formatCurrency(0)).toContain('0,00')
  })
})

describe('formatDate', () => {
  it('formata ISO como dd/MM/yyyy', () => {
    expect(formatDate('2025-06-15T12:00:00Z')).toBe('15/06/2025')
  })
  it('null/undefined viram travessão', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
  })
})

describe('getContractProgress', () => {
  it('datas ausentes → 0', () => {
    expect(getContractProgress(null, null)).toBe(0)
    expect(getContractProgress('2025-01-01', null)).toBe(0)
  })
  it('contrato totalmente no passado → 100', () => {
    expect(getContractProgress('2020-01-01', '2020-12-31')).toBe(100)
  })
  it('contrato totalmente no futuro → 0', () => {
    expect(getContractProgress('2099-01-01', '2099-12-31')).toBe(0)
  })
  it('início == fim (total 0) → 100', () => {
    expect(getContractProgress('2025-06-01', '2025-06-01')).toBe(100)
  })
})

describe('getDaysUntilExpiry', () => {
  it('null → null', () => {
    expect(getDaysUntilExpiry(null)).toBeNull()
  })
  it('data futura → positivo', () => {
    expect(getDaysUntilExpiry('2099-01-01')! > 0).toBe(true)
  })
  it('data passada → negativo', () => {
    expect(getDaysUntilExpiry('2000-01-01')! < 0).toBe(true)
  })
})

describe('getUFFromPhone', () => {
  it('reconhece DDD com prefixo +55', () => {
    expect(getUFFromPhone('+55 84 99999-0000')).toBe('RN')
  })
  it('reconhece DDD sem prefixo', () => {
    expect(getUFFromPhone('(11) 98888-7777')).toBe('SP')
  })
  it('DDD inexistente → null', () => {
    expect(getUFFromPhone('00 12345-6789')).toBeNull()
  })
  it('string vazia → null', () => {
    expect(getUFFromPhone('')).toBeNull()
  })
})

describe('getInitials', () => {
  it('pega as 2 primeiras iniciais', () => {
    expect(getInitials('Gabriel Araujo')).toBe('GA')
  })
  it('nome único → 1 inicial', () => {
    expect(getInitials('Luna')).toBe('L')
  })
  it('ignora espaços extras', () => {
    expect(getInitials('  Maria   Julia  ')).toBe('MJ')
  })
})

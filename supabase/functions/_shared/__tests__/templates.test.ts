import { describe, it, expect, vi } from 'vitest'

// Templates puros — sem dependências Deno/URL. Carregam direto.
vi.mock('https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts', () => ({
  timingSafeEqual: () => true,
}))
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({}))

import {
  renderTarefa,
  renderCadencia,
  renderRenovacao,
  renderIndicacao,
  escapeHtml,
} from '../templates/render.ts'

describe('escapeHtml', () => {
  it('escapa os 5 caracteres especiais', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(escapeHtml('a & b')).toBe('a &amp; b')
    expect(escapeHtml(`"' &`)).toBe('&quot;&#39; &amp;')
  })
})

describe('renderTarefa', () => {
  const out = renderTarefa({
    nomeAtribuido: '<script>alert(1)</script>',
    tituloTarefa: 'Ligar João & Maria',
    deepLink: 'https://app/x?id=123&y=2',
    gerenciarPrefsLink: 'https://app/me?tab=notificacoes',
  })

  it('escapa o nome (XSS guard)', () => {
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(out).not.toContain('<script>alert(1)</script>')
  })

  it('escapa ampersand no título', () => {
    expect(out).toContain('Ligar João &amp; Maria')
  })

  it('NÃO escapa URLs (deepLink literal)', () => {
    expect(out).toContain('href="https://app/x?id=123&y=2"')
  })

  it('NÃO escapa URL do gerenciarPrefsLink', () => {
    expect(out).toContain('href="https://app/me?tab=notificacoes"')
  })

  it('contém o CTA + assinatura CONSEJ', () => {
    expect(out).toContain('Abrir no CRM')
    expect(out).toContain('CONSEJ — Empresa Júnior de Consultoria Jurídica')
  })
})

describe('renderCadencia', () => {
  const out = renderCadencia({
    nomeConsultor: 'Maria <Diretora>',
    totalTarefas: 5,
    totalLeads: 12,
    deepLink: 'https://app/me?x=1&y=2',
    gerenciarPrefsLink: 'https://app/me?tab=notificacoes',
  })

  it('escapa nome (XSS)', () => {
    expect(out).toContain('Maria &lt;Diretora&gt;')
    expect(out).not.toContain('Maria <Diretora>')
  })

  it('substitui contadores numéricos', () => {
    expect(out).toContain('5 tarefa(s)')
    expect(out).toContain('12 lead(s) ativos')
  })

  it('mantém URL literal (não escapa &)', () => {
    expect(out).toContain('href="https://app/me?x=1&y=2"')
  })

  it('contém CTA Abrir Meu Espaço', () => {
    expect(out).toContain('Abrir Meu Espaço')
  })
})

describe('renderRenovacao', () => {
  const out = renderRenovacao({
    nomeResponsavel: 'João',
    nomeCliente: 'ACME & Co',
    diasAteRenovacao: 30,
    valorContrato: 'R$ 12.000,00',
    deepLink: 'https://app/clientes/c1?focus=contrato',
    gerenciarPrefsLink: 'https://app/me?tab=notificacoes',
  })

  it('escapa ampersand no nome do cliente', () => {
    expect(out).toContain('ACME &amp; Co')
  })

  it('substitui dias + valor', () => {
    expect(out).toContain('30 dia(s)')
    expect(out).toContain('R$ 12.000,00')
  })

  it('contém CTA Abrir contrato', () => {
    expect(out).toContain('Abrir contrato')
  })

  it('URL literal preserva query string', () => {
    expect(out).toContain('href="https://app/clientes/c1?focus=contrato"')
  })
})

describe('renderIndicacao', () => {
  const out = renderIndicacao({
    nomeResponsavel: 'Pedro',
    nomeIndicante: 'Cliente X',
    nomeIndicado: '<script>alert(1)</script>',
    segmento: 'Tecnologia',
    deepLink: 'https://app/leads/L1?source=indicacao',
    gerenciarPrefsLink: 'https://app/me?tab=notificacoes',
  })

  it('escapa nomeIndicado (XSS)', () => {
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(out).not.toContain('<script>alert(1)</script>')
  })

  it('substitui indicante + segmento', () => {
    expect(out).toContain('Cliente X')
    expect(out).toContain('Tecnologia')
  })

  it('contém CTA Abrir lead', () => {
    expect(out).toContain('Abrir lead')
  })

  it('URL literal preserva query string', () => {
    expect(out).toContain('href="https://app/leads/L1?source=indicacao"')
  })
})

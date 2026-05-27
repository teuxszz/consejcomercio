import { describe, it, expect, vi } from 'vitest'

// Templates puros — sem dependências Deno/URL. Carregam direto.
vi.mock('https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts', () => ({
  timingSafeEqual: () => true,
}))
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({}))

import { renderTarefa, escapeHtml } from '../templates/render.ts'

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

import { test, expect, type Page } from '@playwright/test'

// Smoke test READ-ONLY: visita todas as rotas internas e verifica que cada uma
// renderiza sem crash, sem erro de console e sem resposta 4xx/5xx do Supabase.
// Não cria nem deleta dados. Roda como diretor e como consultor (2 projetos).

const ROTAS = [
  '/dashboard',
  '/analytics',
  '/icp-dinamico',
  '/mapa',
  '/leads',
  '/prospeccao',
  '/diagnosticos',
  '/objecoes',
  '/clientes',
  '/contratos',
  '/renovacoes',
  '/demandas',
  '/indicacoes',
  '/parceiros',
  '/oportunidades',
  '/reunioes',
  '/mensagens',
  '/cadencia',
  '/slack',
  '/auditoria',
  '/configuracoes',
  '/importar',
  '/pos-juniors',
  '/me',
  '/ajuda',
  '/ranking',
  '/portal-admin',
]

// Ruído de console que não indica bug real (extensões, libs de terceiros).
const IGNORAR_CONSOLE = [
  /Download the React DevTools/i,
  /\[vite\]/i,
  /favicon/i,
]

function coletaErros(page: Page) {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const txt = msg.text()
    if (IGNORAR_CONSOLE.some((r) => r.test(txt))) return
    erros.push(`console.error: ${txt}`)
  })
  page.on('response', (res) => {
    const url = res.url()
    if (url.includes('supabase') && res.status() >= 400) {
      erros.push(`HTTP ${res.status()}: ${url}`)
    }
  })
  return erros
}

for (const rota of ROTAS) {
  test(`rota ${rota} renderiza sem erros`, async ({ page }) => {
    const erros = coletaErros(page)
    await page.goto(rota, { waitUntil: 'networkidle' })

    // não foi redirecionado para /login (sessão válida)
    expect(page.url()).not.toContain('/login')

    // a página tem conteúdo visível (não é tela branca de crash)
    await expect(page.locator('body')).not.toBeEmpty()

    // dá um tempo para queries assíncronas dispararem possíveis erros
    await page.waitForTimeout(800)

    expect(erros, `Erros na rota ${rota}:\n${erros.join('\n')}`).toEqual([])
  })
}

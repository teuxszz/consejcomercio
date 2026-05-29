import { test, expect } from '@playwright/test'

// Phase 7 — Plan 04b — E2E specs do fluxo de documentos cliente↔consultor.
//
// **Spec 1 (smoke consultor):** dashboard /portal-admin/aprovacoes-pendentes
//   renderiza, mostra a tabela (vazia ou com dados) e não dá crash.
//
// **Spec 2 (skip):** fluxo cliente login → upload → consultor approval. Pulado
//   porque tests/e2e/global-setup.ts só faz login de diretor + consultor; não há
//   credencial cliente em .env.test (nem fixture cliente seedada).
//   Cobertura desse fluxo fica para a UAT manual (8 itens, VALIDATION.md).
//
// O fluxo cliente exige:
//   - perfil tipo='cliente' + cliente_id_associado preenchido (handle_new_user
//     normal cria interno=true; cliente precisa ser provisionado manualmente)
//   - storageState distinto (tests/e2e/.auth/cliente.json)
//   - rota /portal/documentos (cliente shell, não AppLayout)
//
// Não vou mockar/forjar esses recursos só para o E2E — UAT humano cobre.

test('smoke: dashboard /portal-admin/aprovacoes-pendentes renderiza para consultor', async ({ page }) => {
  await page.goto('/portal-admin/aprovacoes-pendentes', { waitUntil: 'networkidle' })

  // Não redirecionou para login
  expect(page.url()).not.toContain('/login')

  // H1 visível
  await expect(page.getByRole('heading', { name: /aprova[cç][õo]es pendentes/i, level: 1 }))
    .toBeVisible()

  // Estado vazio ou tabela presente
  const empty = page.locator('text=/nenhuma aprova[cç][ãa]o pendente/i')
  const table = page.locator('table')
  await expect(empty.or(table).first()).toBeVisible()
})

test('smoke: dashboard /portal-admin/aprovacoes-pendentes renderiza para diretor (banner uso bucket)', async ({ page }) => {
  await page.goto('/portal-admin/aprovacoes-pendentes', { waitUntil: 'networkidle' })

  // Banner uso bucket deve aparecer para coord+ (regex matcha "MB / ... MB" da renderização)
  const banner = page.locator('text=/Uso do bucket cliente-docs/i')
  // Pode demorar para useBucketUsage carregar — wait com timeout extra
  await expect(banner).toBeVisible({ timeout: 15_000 })
})

test.skip('cliente faz upload de PDF e vê o doc na lista do Portal', async ({ page }) => {
  // Skipado: não há fixture cliente + storageState em tests/e2e/.auth/cliente.json.
  // Cobertura via UAT manual (VALIDATION.md §Manual-Only item 1, 2, 8).
  void page
})

test.skip('consultor vê doc do cliente na ficha e aprova', async ({ page }) => {
  // Skipado: depende de cliente fixture ter feito upload primeiro (spec acima).
  // Cobertura via UAT manual (VALIDATION.md §Manual-Only item 8).
  void page
})

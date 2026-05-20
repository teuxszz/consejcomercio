import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM: __dirname não existe
const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..', '..', '..')  // projeto root

// ─── Carrega variáveis de ambiente (.env.test tem prioridade; fallback para .env)
function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnvFile(resolve(__dirname, '.env.test'))
loadEnvFile(resolve(__dirname, '.env'))

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const QA_EMAIL = process.env.QA_DIRETOR_EMAIL ?? ''
const QA_PASSWORD = process.env.QA_DIRETOR_PASSWORD ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar em .env ou .env.test'
  )
}
if (!QA_EMAIL || !QA_PASSWORD) {
  throw new Error(
    'QA_DIRETOR_EMAIL e QA_DIRETOR_PASSWORD precisam estar em .env.test. ' +
    'Crie o usuário QA no Supabase Auth e defina as variáveis antes de rodar os e2e.'
  )
}

// ─── Cliente Supabase autenticado (usado apenas para setup/cleanup fora do browser)
const anonDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── Dados do lead descartável
const TS = Date.now()
const LEAD_NOME = `E2E-LIXEIRA-${TS}`
const LEAD_EMPRESA = `E2E-EMP-${TS}`

let leadId: string | null = null

test.beforeAll(async () => {
  // Autentica com o usuário QA diretor para poder criar leads via RLS
  const { data: authData, error: authError } = await anonDb.auth.signInWithPassword({
    email: QA_EMAIL,
    password: QA_PASSWORD,
  })
  if (authError || !authData.session) {
    throw new Error(`Falha no login do usuário QA diretor: ${authError?.message ?? 'sem sessão'}`)
  }

  // Cria o lead descartável com a sessão autenticada
  const { data, error } = await anonDb
    .from('leads')
    .insert({
      nome: LEAD_NOME,
      empresa: LEAD_EMPRESA,
      segmento: 'juridico',
      telefone: '84900000000',
      origem: 'indicacao_direta',
      status: 'novo',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Falha ao criar lead descartável: ${error.message}`)
  leadId = data.id
})

test.afterAll(async () => {
  if (!leadId) return

  // Tenta limpar linhas da lixeira referentes ao lead (pode existir se o teste
  // falhou após a exclusão mas antes da restauração).
  await anonDb.from('leads_lixeira').delete().eq('lead_id', leadId)

  // Tenta apagar o lead diretamente caso o teste tenha falhado antes da exclusão
  // ou se o lead foi restaurado (o teardown do teste garante que não sobra resíduo).
  // Com anon key + RLS is_interno(), funciona enquanto a sessão do beforeAll estiver ativa.
  // Se a sessão expirou ou o cleanup falhar, o lead tem nome E2E-LIXEIRA-* e é
  // facilmente identificável para remoção manual.
  const { error: delErr } = await anonDb.from('leads').delete().eq('id', leadId)
  if (delErr) {
    console.warn(
      `[cleanup] Não foi possível remover o lead ${leadId} (${delErr.message}). ` +
      `Remova manualmente buscando por nome="${LEAD_NOME}".`
    )
  }

  await anonDb.auth.signOut()
})

// ─── Teste principal: round-trip exclusão → lixeira → restauração
// Este spec roda no projeto "diretor" (storageState: tests/e2e/.auth/diretor.json).
test('round-trip: excluir lead → aparece na lixeira → restaurar → lead reaparece', async ({ page }) => {
  expect(leadId, 'leadId deve estar definido após beforeAll').toBeTruthy()

  // ── PASSO 1: navegar para a página do lead e clicar em "Excluir lead" ───────
  await page.goto(`/leads/${leadId}`, { waitUntil: 'networkidle' })

  // A página deve carregar com o nome do lead
  await expect(page.getByRole('heading', { name: LEAD_NOME })).toBeVisible()

  // Clica no botão "Excluir lead" (vermelho, com ícone Trash2)
  await page.getByRole('button', { name: /excluir lead/i }).click()

  // ── PASSO 2: confirmar no DeleteConfirmDialog ─────────────────────────────
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Confirmar exclusão')).toBeVisible()

  // O botão "Excluir" fica habilitado assim que o RPC inspecionar_exclusao retornar
  const btnExcluir = page.getByRole('button', { name: /^excluir$/i })
  await expect(btnExcluir).toBeEnabled({ timeout: 10_000 })
  await btnExcluir.click()

  // ── PASSO 3: verificar que o lead sumiu ───────────────────────────────────
  // LeadDetailPage navega para /leads após exclusão bem-sucedida
  await page.waitForURL((url) => !url.pathname.includes(`/leads/${leadId}`), {
    timeout: 15_000,
  })

  // Voltar ao ID excluído deve mostrar "Lead não encontrado."
  await page.goto(`/leads/${leadId}`, { waitUntil: 'networkidle' })
  await expect(page.getByText('Lead não encontrado')).toBeVisible()

  // ── PASSO 4: o lead deve aparecer na lixeira em /auditoria ────────────────
  await page.goto('/auditoria', { waitUntil: 'networkidle' })

  // O card "Lixeira de leads" deve estar visível
  await expect(page.getByText(/lixeira de leads/i)).toBeVisible({ timeout: 10_000 })

  // O nome único do lead deve aparecer no card
  const lixeiraItem = page.getByText(LEAD_NOME)
  await expect(lixeiraItem).toBeVisible({ timeout: 10_000 })

  // ── PASSO 5: restaurar o lead clicando em "Restaurar" ────────────────────
  // Localiza a linha que contém o nome do lead e clica no botão "Restaurar" dela
  const itemRow = page
    .locator('div')
    .filter({ hasText: LEAD_NOME })
    .filter({ has: page.getByRole('button', { name: /restaurar/i }) })
    .first()

  await expect(itemRow).toBeVisible()
  await itemRow.getByRole('button', { name: /restaurar/i }).click()

  // O item deve desaparecer da lixeira após restauração
  await expect(lixeiraItem).not.toBeVisible({ timeout: 15_000 })

  // ── PASSO 6: o lead deve estar de volta em /leads/:id ─────────────────────
  await page.goto(`/leads/${leadId}`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: LEAD_NOME })).toBeVisible({ timeout: 10_000 })
})

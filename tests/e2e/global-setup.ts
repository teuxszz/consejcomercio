import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Faz login uma vez por role e salva o storageState (sessão) em
// tests/e2e/.auth/{role}.json — reutilizado por todos os specs.
//
// Pré-requisito: criar os usuários QA no Supabase Auth e definir em .env.test:
//   QA_DIRETOR_EMAIL=qa-diretor@consej.com
//   QA_DIRETOR_PASSWORD=...
//   QA_CONSULTOR_EMAIL=qa-consultor@consej.com
//   QA_CONSULTOR_PASSWORD=...

interface Role {
  name: 'diretor' | 'consultor'
  email?: string
  password?: string
}

async function loginAndSave(baseURL: string, role: Role) {
  if (!role.email || !role.password) {
    throw new Error(
      `Credenciais QA ausentes para "${role.name}". Defina QA_${role.name.toUpperCase()}_EMAIL ` +
      `e QA_${role.name.toUpperCase()}_PASSWORD em .env.test.`
    )
  }
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(`${baseURL}/login`)
  await page.fill('#email', role.email)
  await page.fill('#password', role.password)
  await page.click('button[type="submit"]')
  // Espera sair da tela de login (redireciona pro dashboard)
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
  await page.context().storageState({ path: resolve('tests/e2e/.auth', `${role.name}.json`) })
  await browser.close()
}

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? process.env.E2E_BASE_URL ?? 'http://localhost:5173'
  mkdirSync(resolve('tests/e2e/.auth'), { recursive: true })

  await loginAndSave(baseURL, {
    name: 'diretor',
    email: process.env.QA_DIRETOR_EMAIL,
    password: process.env.QA_DIRETOR_PASSWORD,
  })
  await loginAndSave(baseURL, {
    name: 'consultor',
    email: process.env.QA_CONSULTOR_EMAIL,
    password: process.env.QA_CONSULTOR_PASSWORD,
  })
}

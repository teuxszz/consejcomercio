import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM: __dirname não existe — derivar da URL do módulo
const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')

// Carrega .env.test (não commitado) sem dependência externa.
const envPath = resolve(__dirname, '.env.test')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Sobe o dev server automaticamente se ainda não estiver rodando.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'diretor',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/diretor.json' },
    },
    {
      name: 'consultor',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/consultor.json' },
    },
  ],
})

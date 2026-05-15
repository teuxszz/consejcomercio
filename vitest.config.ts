import { defineConfig } from 'vitest/config'
import path from 'path'

// Config dedicada do Vitest — separada do vite.config.ts para evitar conflito
// de versões de Vite (o Vitest empacota a própria cópia). O Vitest transforma
// JSX/TSX via esbuild, então o plugin react do Vite não é necessário aqui.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/rls/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/hooks/**', 'src/components/shared/**'],
    },
  },
})

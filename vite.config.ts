import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      // Downloads do navegador às vezes caem na raiz do projeto; arquivos
      // parciais/travados (.crdownload, "Não confirmado *", etc.) fazem o file
      // watcher do Vite lançar EBUSY e derrubam o dev server. Ignorá-los.
      ignored: [
        '**/*.crdownload',
        '**/*.part',
        '**/*.tmp',
        '**/Não confirmado*',
        '**/Unconfirmed*',
      ],
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Phase 8 (A8 RESEARCH) — chunks separados nomeados para libs de
        // export, garantindo que dist/assets/jspdf-*.js etc. existam (lazy
        // import sozinho gera chunks com hash, mas sem prefix legivel).
        // Confirma visualmente que jspdf+html2canvas+papaparse+jszip estao
        // fora do main bundle (REP-02 / REP-03 lazy load).
        manualChunks(id: string) {
          if (id.includes('node_modules/jspdf')) return 'jspdf'
          if (id.includes('node_modules/html2canvas')) return 'html2canvas'
          if (id.includes('node_modules/papaparse')) return 'papaparse'
          if (id.includes('node_modules/jszip')) return 'jszip'
        },
      },
    },
  },
})

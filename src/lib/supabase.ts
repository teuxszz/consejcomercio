import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Falha cedo e com mensagem clara — sem isso o app sobe e quebra
// silenciosamente na primeira query quando o .env está ausente/incompleto.
if (!supabaseUrl || !supabaseAnonKey) {
  const faltando = [
    !supabaseUrl && 'VITE_SUPABASE_URL',
    !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean).join(', ')
  throw new Error(
    `Configuração ausente: ${faltando}. Crie um arquivo .env na raiz do projeto ` +
    `com as variáveis do Supabase (veja .env.example).`
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

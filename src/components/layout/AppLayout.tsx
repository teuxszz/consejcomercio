import { useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Sidebar } from './Sidebar'
import { GlobalSearch } from './GlobalSearch'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { Toaster } from 'sonner'

export function AppLayout() {
  const navigate      = useNavigate()
  const location      = useLocation()
  const queryClient   = useQueryClient()
  const [checking, setChecking] = useState(true)
  const loggedSessionRef = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        navigate('/login', { replace: true })
        return
      }
      // Clientes pertencem ao portal, não ao CRM
      const { data: perfil } = await supabase
        .from('perfis')
        .select('tipo')
        .eq('id', session.user.id)
        .single()
      if (perfil?.tipo === 'cliente') {
        navigate('/portal', { replace: true })
        return
      }
      setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        // Clear the entire React Query cache so the next user never
        // sees stale data (profile, leads, etc.) from the previous session.
        queryClient.clear()
        navigate('/login', { replace: true })
      }

      if (event === 'SIGNED_IN' && session?.user) {
        // Guard against React 19 StrictMode double-invoke: only record once per access_token.
        if (loggedSessionRef.current !== session.access_token) {
          loggedSessionRef.current = session.access_token
          supabase.from('audit_logs').insert({
            tabela: 'perfis',
            registro_id: session.user.id,
            acao: 'login',
            usuario: session.user.email ?? null,
          }).then(({ error }) => { if (error) console.error('audit login:', error) })
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate, queryClient])

  if (checking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5" style={{ backgroundColor: '#00081d' }}>
        <img src="/logo.png" alt="CONSEJ" className="h-12 w-auto opacity-90" />
        <div
          className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(107,208,231,0.2)', borderTopColor: 'var(--cyan-hi)' }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <div key={location.pathname} className="p-6 animate-in fade-in duration-150">
          <Outlet />
        </div>
      </main>
      <GlobalSearch />
      <OnboardingWizard />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
          },
        }}
      />
    </div>
  )
}

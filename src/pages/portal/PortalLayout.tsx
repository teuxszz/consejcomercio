import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { usePortalPerfil } from '@/hooks/usePortal'
import { calcularNivel, NIVEL_CONFIG } from '@/types'
import { Toaster, toast } from 'sonner'
import { Wallet, UserPlus, Gift, ClipboardList, LogOut, Coins, LayoutDashboard, ChevronsUpDown, BellRing, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const NAV = [
  { to: '/portal',           label: 'Carteira',  icon: Wallet,        end: true },
  { to: '/portal/indicar',   label: 'Indicar',   icon: UserPlus       },
  { to: '/portal/catalogo',  label: 'Catálogo',  icon: Gift           },
  { to: '/portal/historico', label: 'Histórico', icon: ClipboardList  },
  // ─── Phase 7 — Client Portal Expansion (Plan 07-03) ─────────────────────
  { to: '/portal/documentos', label: 'Documentos', icon: FileText      },
  { to: '/portal/preferencias', label: 'Preferências', icon: BellRing  },
]

export function PortalLayout() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const { data: perfil } = usePortalPerfil()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login', { replace: true })
        return
      }
      setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) navigate('/login', { replace: true })
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
    toast.success('Sessão encerrada.')
  }

  if (checking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5" style={{ backgroundColor: '#00081d' }}>
        <img src="/logo.png" alt="CONSEJ" className="h-12 w-auto opacity-90" />
        <div className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(107,208,231,0.2)', borderTopColor: '#6bd0e7' }} />
      </div>
    )
  }

  const nivel = perfil ? calcularNivel(perfil.tokens_historico_total ?? 0) : 'bronze'
  const nivelCfg = NIVEL_CONFIG[nivel]
  const initials = perfil?.nome
    ? perfil.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#00081d' }}>
      <Toaster richColors position="top-right" />

      {/* Header */}
      <header style={{
        backgroundColor: '#00081d',
        borderBottom: '1px solid rgba(0,137,172,0.15)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="CONSEJ" className="h-7 w-auto" />
            <span style={{ fontSize: 10, color: 'rgba(107,208,231,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}
              className="hidden sm:block">
              Portal de Indicações
            </span>
          </div>

          {/* Saldo + avatar */}
          <div className="flex items-center gap-3">
            {perfil && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(0,137,172,0.1)', border: '1px solid rgba(0,137,172,0.2)' }}>
                <Coins className="w-3.5 h-3.5" style={{ color: nivelCfg.cor }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  {(perfil.tokens_saldo ?? 0).toLocaleString('pt-BR')}
                </span>
                <span style={{ fontSize: 10, color: nivelCfg.cor, fontWeight: 600 }}>
                  {nivelCfg.label.toUpperCase()}
                </span>
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 px-1.5 py-1 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-600"
                  style={{ color: 'rgba(107,208,231,0.8)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,137,172,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {perfil?.foto_url ? (
                    <img src={perfil.foto_url} alt={perfil.nome} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ backgroundColor: '#0089ac' }}>
                      {initials}
                    </div>
                  )}
                  <span style={{ fontSize: 13 }} className="hidden sm:block">
                    {perfil?.nome?.split(' ')[0] ?? ''}
                  </span>
                  <ChevronsUpDown className="w-3.5 h-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium truncate">{perfil?.nome ?? 'Usuário'}</span>
                    {perfil?.email && (
                      <span className="text-xs text-muted-foreground truncate">{perfil.email}</span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {perfil?.tipo === 'interno' && (
                  <>
                    <DropdownMenuItem onSelect={() => navigate('/dashboard')}>
                      <LayoutDashboard className="w-4 h-4" />
                      Ir para o CRM
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onSelect={handleLogout}>
                  <LogOut className="w-4 h-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav style={{ borderBottom: '1px solid rgba(0,137,172,0.1)', backgroundColor: '#00081d' }}>
        <div className="max-w-5xl mx-auto px-4 flex">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs sm:text-sm border-b-2 transition-colors',
                isActive
                  ? 'border-[#0089ac] text-white font-medium'
                  : 'border-transparent text-[rgba(107,208,231,0.55)] hover:text-[rgba(107,208,231,0.9)] hover:border-[rgba(0,137,172,0.3)]'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Page content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}

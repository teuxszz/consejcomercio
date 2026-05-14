import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, KanbanSquare, Stethoscope, Users, FileText,
  Inbox, Share2, Handshake, TrendingUp, ClipboardList, Settings,
  LogOut, MessageSquare, CalendarDays, Sparkles, Search, BarChart2, Map, Upload, GraduationCap,
  Sun, Moon, Target, HelpCircle, Send, Coins, Gift, ShieldQuestion, Crosshair,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ─── Nav structure ────────────────────────────────────────────────────────────

const NAV_GROUPS: { label?: string; items: { to: string; label: string; icon: React.FC<{ className?: string }> }[] }[] = [
  {
    items: [
      { to: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
      { to: '/analytics',     label: 'Analytics',     icon: BarChart2       },
      { to: '/icp-dinamico',  label: 'ICP Dinâmico',  icon: Crosshair       },
      { to: '/mapa',          label: 'Mapa',          icon: Map             },
    ],
  },
  {
    label: 'PIPELINE',
    items: [
      { to: '/leads',        label: 'Leads',        icon: KanbanSquare    },
      { to: '/prospeccao',   label: 'Prospecção',   icon: Target          },
      { to: '/diagnosticos', label: 'Diagnósticos', icon: Stethoscope     },
      { to: '/objecoes',     label: 'Objeções',     icon: ShieldQuestion  },
    ],
  },
  {
    label: 'CLIENTES',
    items: [
      { to: '/clientes',      label: 'Clientes',      icon: Users       },
      { to: '/contratos',     label: 'Contratos',     icon: FileText    },
      { to: '/renovacoes',    label: 'Renovações',    icon: CalendarDays },
      { to: '/demandas',      label: 'Demandas',      icon: Inbox       },
      { to: '/oportunidades', label: 'Oportunidades', icon: TrendingUp  },
    ],
  },
  {
    label: 'CRESCIMENTO',
    items: [
      { to: '/indicacoes',    label: 'Indicações',    icon: Share2         },
      { to: '/parceiros',     label: 'Parceiros',     icon: Handshake      },
      { to: '/pos-juniors',   label: 'Pós-Juniors',   icon: GraduationCap  },
      { to: '/portal-admin',  label: 'Portal Tokens', icon: Coins          },
      { to: '/portal',        label: 'Meu Portal',    icon: Gift           },
    ],
  },
  {
    label: 'COMUNICAÇÃO',
    items: [
      { to: '/reunioes',  label: 'Reuniões',  icon: CalendarDays },
      { to: '/mensagens', label: 'Mensagens', icon: Sparkles     },
      { to: '/slack',     label: 'Slack',     icon: MessageSquare },
    ],
  },
]

const UTILITY_ITEMS = [
  { to: '/importar',      label: 'Importar',      icon: Upload        },
  { to: '/auditoria',     label: 'Auditoria',     icon: ClipboardList },
  { to: '/ajuda',         label: 'Ajuda',         icon: HelpCircle    },
  { to: '/configuracoes', label: 'Configurações', icon: Settings      },
]

// ─── Active style (contrast-safe: white on #006d88 = 5.7:1) ──────────────────
const ACTIVE_BG = '#006d88'
const HOVER_BG  = '#00263a'

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: React.FC<{ className?: string }> }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors', isActive ? 'text-white' : 'hover:text-white')
      }
      style={({ isActive }) => isActive ? { backgroundColor: ACTIVE_BG, color: '#fff' } : { color: '#6bd0e7' }}
      onMouseEnter={e => { const el = e.currentTarget; if (!el.getAttribute('aria-current')) el.style.backgroundColor = HOVER_BG }}
      onMouseLeave={e => { const el = e.currentTarget; if (!el.getAttribute('aria-current')) el.style.backgroundColor = '' }}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </NavLink>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Sidebar() {
  const navigate = useNavigate()
  const { data: perfil } = useMeuPerfil()
  const { theme, toggleTheme } = useTheme()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
    toast.success('Sessão encerrada.')
  }

  const initials = perfil?.nome
    ? perfil.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <div className="w-56 shrink-0 h-screen flex flex-col" style={{ backgroundColor: '#00081d' }}>

      {/* Logo */}
      <div className="flex items-center justify-center px-4 py-5" style={{ borderBottom: '1px solid #000d32' }}>
        <img src="/logo.png" alt="CONSEJ" className="h-10 w-auto" />
      </div>

      {/* Search hint */}
      <div className="px-2 py-2" style={{ borderBottom: '1px solid #000d32' }}>
        <button
          onClick={() => {
            const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
            window.dispatchEvent(ev)
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
          style={{ color: '#6bd0e7', backgroundColor: 'rgba(0,137,172,0.08)', border: '1px solid rgba(0,137,172,0.15)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = HOVER_BG }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0,137,172,0.08)' }}
        >
          <Search className="w-3.5 h-3.5 shrink-0 opacity-70" />
          <span className="flex-1 text-left opacity-70">Buscar…</span>
          <kbd className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded font-mono opacity-60">⌘K</kbd>
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {NAV_GROUPS.map((group, i) => (
          <div key={i}>
            {group.label && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-widest uppercase"
                style={{ color: 'rgba(0,137,172,0.45)' }}>
                {group.label}
              </p>
            )}
            {group.items.map(item => <NavItem key={item.to} {...item} />)}
          </div>
        ))}

        {/* Separator + utility items */}
        <div style={{ borderTop: '1px solid #000d32', paddingTop: '6px', marginTop: '6px' }}>
          {UTILITY_ITEMS.map(item => <NavItem key={item.to} {...item} />)}
        </div>
      </nav>

      {/* Profile + Theme + Logout */}
      <div className="p-2 space-y-1" style={{ borderTop: '1px solid #000d32' }}>
        <NavLink
          to="/me"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm w-full transition-colors"
          style={({ isActive }) => isActive ? { backgroundColor: ACTIVE_BG, color: '#fff' } : { color: '#6bd0e7' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = HOVER_BG }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
        >
          {perfil?.foto_url ? (
            <img src={perfil.foto_url} alt={perfil.nome} className="w-5 h-5 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-cyan-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              {initials}
            </div>
          )}
          <span className="truncate">{perfil?.nome ? `${perfil.nome} — Meu Espaço` : 'Meu Espaço'}</span>
        </NavLink>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm w-full transition-colors"
          style={{ color: '#6bd0e7' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = HOVER_BG; (e.currentTarget as HTMLElement).style.color = '#fff' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; (e.currentTarget as HTMLElement).style.color = '#6bd0e7' }}
          title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        >
          {theme === 'dark'
            ? <Sun className="w-4 h-4 shrink-0" />
            : <Moon className="w-4 h-4 shrink-0" />
          }
          {theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm w-full transition-colors"
          style={{ color: '#6bd0e7' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = HOVER_BG; (e.currentTarget as HTMLElement).style.color = '#fff' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; (e.currentTarget as HTMLElement).style.color = '#6bd0e7' }}
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LayoutDashboard, CheckSquare, Users, Calendar, UserCircle2, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { useMinhasTarefas } from '@/hooks/useTarefas'
import { useLeads } from '@/hooks/useLeads'
import { useContratos } from '@/hooks/useContratos'
import { useOportunidades } from '@/hooks/useOportunidades'
import { useInteracoes } from '@/hooks/useInteracoes'
import { useReunioes } from '@/hooks/useReunioes'
import { deriveTarefas } from '@/lib/tarefas-derivadas'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VisaoGeralPanel } from '@/components/me/VisaoGeralPanel'
import { TarefasPanel } from '@/components/me/TarefasPanel'
import { MeusLeadsPanel } from '@/components/me/MeusLeadsPanel'
import { MinhaAgendaPanel } from '@/components/me/MinhaAgendaPanel'
import { PerfilPanel } from '@/components/me/PerfilPanel'
import { NotificacoesPanel } from '@/components/me/NotificacoesPanel'
import { InstalarAppCard } from '@/components/me/InstalarAppCard'
import { TERMINAL_STAGES } from '@/lib/constants'

const TABS = [
  { id: 'visao',         label: 'Visão Geral',     icon: LayoutDashboard },
  { id: 'tarefas',       label: 'Minhas Tarefas',  icon: CheckSquare    },
  { id: 'leads',         label: 'Meus Leads',      icon: Users          },
  { id: 'agenda',        label: 'Minha Agenda',    icon: Calendar       },
  { id: 'notificacoes',  label: 'Notificações',    icon: Bell           },
  { id: 'perfil',        label: 'Perfil',          icon: UserCircle2    },
] as const

type TabId = typeof TABS[number]['id']

export function MeEspacoPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as TabId | null
  const [tab, setTab] = useState<TabId>(tabParam && TABS.find(t => t.id === tabParam) ? tabParam : 'visao')

  const [userId, setUserId] = useState<string>('')
  const { data: perfil } = useMeuPerfil()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  function handleTabChange(v: string) {
    setTab(v as TabId)
    const params = new URLSearchParams(searchParams)
    params.set('tab', v)
    setSearchParams(params, { replace: true })
  }

  // Contadores para os badges das abas
  const { data: minhasTarefas = [] } = useMinhasTarefas(userId)
  const { data: leads = [] } = useLeads()
  const { data: contratos = [] } = useContratos()
  const { data: oportunidades = [] } = useOportunidades()
  const { data: interacoes = [] } = useInteracoes()
  const { data: reunioes = [] } = useReunioes()

  const derivadas = deriveTarefas({ meuId: userId, leads, contratos, oportunidades, interacoes, reunioes })
  const totalTarefas = minhasTarefas.length + derivadas.length
  const totalMeusLeads = leads.filter(l => l.responsavel_id === userId && !(TERMINAL_STAGES as readonly string[]).includes(l.status)).length
  const totalMinhaAgenda = reunioes.filter(r => r.responsavel_id === userId && r.status === 'agendada' && new Date(r.data_hora) >= new Date()).length

  const badges: Partial<Record<TabId, number>> = {
    tarefas: totalTarefas,
    leads:   totalMeusLeads,
    agenda:  totalMinhaAgenda,
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center text-white text-lg font-bold shrink-0" style={{ backgroundColor: '#0089ac' }}>
          {perfil?.foto_url
            ? <img src={perfil.foto_url} alt={perfil.nome} className="w-full h-full object-cover" />
            : perfil?.nome
              ? perfil.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
              : '?'
          }
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meu Espaço</h1>
          <p className="text-sm text-muted-foreground">
            {perfil?.nome ?? 'Seu painel pessoal'}
            {perfil?.cargo && <span className="ml-1.5 text-fg4">— {perfil.cargo}</span>}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon
            const badge = badges[t.id]
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {typeof badge === 'number' && badge > 0 && (
                  <span
                    className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(0,137,172,0.18)', color: '#6bd0e7' }}
                  >
                    {badge}
                  </span>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="visao"   className="mt-6"><VisaoGeralPanel userId={userId} /></TabsContent>
        <TabsContent value="tarefas" className="mt-6"><TarefasPanel    userId={userId} /></TabsContent>
        <TabsContent value="leads"   className="mt-6"><MeusLeadsPanel  userId={userId} /></TabsContent>
        <TabsContent value="agenda"  className="mt-6"><MinhaAgendaPanel userId={userId} /></TabsContent>
        <TabsContent value="notificacoes" className="mt-6 space-y-6">
          <InstalarAppCard />
          <NotificacoesPanel />
        </TabsContent>
        <TabsContent value="perfil"  className="mt-6"><PerfilPanel /></TabsContent>
      </Tabs>
    </div>
  )
}

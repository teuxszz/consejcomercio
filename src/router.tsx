import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { LeadsPage } from '@/pages/LeadsPage'
import { LeadDetailPage } from '@/pages/LeadDetailPage'
import { DiagnosticosPage } from '@/pages/DiagnosticosPage'
import { ClientesPage } from '@/pages/ClientesPage'
import { ClienteDetailPage } from '@/pages/ClienteDetailPage'
import { ContratosPage } from '@/pages/ContratosPage'
import { DemandasPage } from '@/pages/DemandasPage'
import { IndicacoesPage } from '@/pages/IndicacoesPage'
import { ParceirosPage } from '@/pages/ParceirosPage'
import { OportunidadesPage } from '@/pages/OportunidadesPage'
import { AuditoriaPage } from '@/pages/AuditoriaPage'
import { ConfiguracoesPage } from '@/pages/ConfiguracoesPage'
import { SlackPage } from '@/pages/SlackPage'
import { ReunioesPage } from '@/pages/ReunioesPage'
import { MeEspacoPage } from '@/pages/MeEspacoPage'
import { NotificacoesHistoricoPage } from '@/pages/NotificacoesHistoricoPage'
import { MensagensPage } from '@/pages/MensagensPage'
import { CadenciaPage } from '@/pages/CadenciaPage'
import { ObjecoesPage } from '@/pages/ObjecoesPage'
import { IcpDinamicoPage } from '@/pages/IcpDinamicoPage'
import { RenovacoesPage } from '@/pages/RenovacoesPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { MapaPage } from '@/pages/MapaPage'
import { ImportarPage } from '@/pages/ImportarPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { PosJuniorsPage } from '@/pages/PosJuniorsPage'
import { ProspeccaoPage } from '@/pages/ProspeccaoPage'
import { AjudaPage } from '@/pages/AjudaPage'
import { RankingPage } from '@/pages/RankingPage'
import { TarefasPage } from '@/pages/TarefasPage'
import { AdocaoPage } from '@/pages/AdocaoPage'
import { ReceitaPage } from '@/pages/ReceitaPage'
import { PortalAdminPage } from '@/pages/PortalAdminPage'
import { PortalLayout } from '@/pages/portal/PortalLayout'
import { PortalWalletPage } from '@/pages/portal/PortalWalletPage'
import { PortalIndicarPage } from '@/pages/portal/PortalIndicarPage'
import { PortalCatalogoPage } from '@/pages/portal/PortalCatalogoPage'
import { PortalHistoricoPage } from '@/pages/portal/PortalHistoricoPage'
import { PortalPreferenciasPage } from '@/pages/portal/PortalPreferenciasPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'mapa', element: <MapaPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: 'leads/:id', element: <LeadDetailPage /> },
      { path: 'prospeccao', element: <ProspeccaoPage /> },
      { path: 'diagnosticos', element: <DiagnosticosPage /> },
      { path: 'clientes', element: <ClientesPage /> },
      { path: 'clientes/:id', element: <ClienteDetailPage /> },
      { path: 'contratos', element: <ContratosPage /> },
      { path: 'demandas', element: <DemandasPage /> },
      { path: 'indicacoes', element: <IndicacoesPage /> },
      { path: 'parceiros', element: <ParceirosPage /> },
      { path: 'oportunidades', element: <OportunidadesPage /> },
      { path: 'reunioes', element: <ReunioesPage /> },
      { path: 'mensagens', element: <MensagensPage /> },
      { path: 'cadencia', element: <CadenciaPage /> },
      { path: 'objecoes', element: <ObjecoesPage /> },
      { path: 'icp-dinamico', element: <IcpDinamicoPage /> },
      { path: 'renovacoes', element: <RenovacoesPage /> },
      { path: 'slack', element: <SlackPage /> },
      { path: 'auditoria', element: <AuditoriaPage /> },
      { path: 'configuracoes', element: <ConfiguracoesPage /> },
      { path: 'importar', element: <ImportarPage /> },
      { path: 'pos-juniors', element: <PosJuniorsPage /> },
      { path: 'me', element: <MeEspacoPage /> },
      { path: 'me/notificacoes-historico', element: <NotificacoesHistoricoPage /> },
      { path: 'me/preferencias', element: <Navigate to="/me?tab=notificacoes" replace /> },
      { path: 'preferencias', element: <Navigate to="/me?tab=notificacoes" replace /> },
      { path: 'perfil', element: <Navigate to="/me?tab=perfil" replace /> },
      { path: 'ajuda', element: <AjudaPage /> },
      { path: 'ranking', element: <RankingPage /> },
      { path: 'portal-admin', element: <PortalAdminPage /> },
      { path: 'tarefas', element: <TarefasPage /> },
      { path: 'adocao', element: <AdocaoPage /> },
      { path: 'receita', element: <ReceitaPage /> },
    ],
  },
  {
    path: '/portal',
    element: <PortalLayout />,
    children: [
      { index: true,             element: <PortalWalletPage />   },
      { path: 'indicar',         element: <PortalIndicarPage />  },
      { path: 'catalogo',        element: <PortalCatalogoPage /> },
      { path: 'historico',       element: <PortalHistoricoPage />},
      { path: 'preferencias',    element: <PortalPreferenciasPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])

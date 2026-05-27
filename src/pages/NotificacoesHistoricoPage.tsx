import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardList,
  Mail,
  MessageSquare,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMeuPerfil, usePerfis } from '@/hooks/usePerfis'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { useNotificacoesEnvios } from '@/hooks/useNotificacoesEnvios'
import { useReenviarNotificacao } from '@/hooks/useReenviarNotificacao'
import type { NotificacaoEnvio, StatusNotif, CanalNotif } from '@/types'

// ─── Status visual map (mirror AuditoriaPage:9–17) ───────────────────────────

const STATUS_COLORS: Record<StatusNotif, { bg: string; color: string; label: string }> = {
  queued:               { bg: 'rgba(148,163,184,0.18)', color: '#94a3b8', label: 'na fila' },
  delivered:            { bg: 'rgba(59,130,246,0.15)',  color: '#93c5fd', label: 'entregue' },
  opened:               { bg: 'rgba(16,185,129,0.15)',  color: '#34d399', label: 'aberto' },
  bounced:              { bg: 'rgba(239,68,68,0.18)',   color: '#f87171', label: 'bounced' },
  complained:           { bg: 'rgba(239,68,68,0.18)',   color: '#f87171', label: 'reclamado' },
  dropped_quota:        { bg: 'rgba(245,158,11,0.18)',  color: '#fbbf24', label: 'quota cheia' },
  skipped_no_recipient: { bg: 'rgba(148,163,184,0.18)', color: '#94a3b8', label: 'sem destinatário' },
  fallback_diretor:     { bg: 'rgba(245,158,11,0.18)',  color: '#fbbf24', label: 'fallback diretor' },
  failed:               { bg: 'rgba(239,68,68,0.18)',   color: '#f87171', label: 'falhou' },
}

function canalIcon(canal: CanalNotif) {
  return canal === 'email'
    ? <Mail className="w-4 h-4 text-fg4" aria-label="E-mail" />
    : <MessageSquare className="w-4 h-4 text-fg4" aria-label="Slack" />
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function tipoLabel(tipo: NotificacaoEnvio['tipo']): string {
  return ({
    tarefa: 'Tarefa',
    cadencia: 'Cadência',
    renovacao: 'Renovação',
    indicacao: 'Indicação',
  } as const)[tipo]
}

export function NotificacoesHistoricoPage() {
  const { data: meu } = useMeuPerfil()
  const { isCoordenadorOrAcima } = useCurrentRole()
  const { data: perfis = [] } = usePerfis()

  const [filtroPerfilId, setFiltroPerfilId] = useState<string | null>(null)
  const { data: envios = [], isLoading } = useNotificacoesEnvios(filtroPerfilId)
  const reenviar = useReenviarNotificacao()

  const perfisInternos = useMemo(
    () => perfis.filter(p => p.tipo !== 'cliente'),
    [perfis],
  )

  function podeReenviar(env: NotificacaoEnvio): boolean {
    if (!meu) return false
    return env.perfil_id === meu.id || isCoordenadorOrAcima
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/me?tab=notificacoes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold text-foreground">Histórico de notificações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Últimos 30 dias. {isCoordenadorOrAcima
            ? 'Como coordenador+, você pode filtrar por qualquer membro do time.'
            : 'Você vê apenas os seus envios.'}
        </p>
      </div>

      {isCoordenadorOrAcima && (
        <div className="flex items-center gap-3">
          <label htmlFor="filtroUser" className="text-sm text-fg2">
            Filtrar por usuário:
          </label>
          <Select
            value={filtroPerfilId ?? '__meu__'}
            onValueChange={v => setFiltroPerfilId(v === '__meu__' ? null : v)}
          >
            <SelectTrigger
              id="filtroUser"
              aria-label="Filtrar por usuário"
              role="combobox"
              className="max-w-xs"
            >
              <SelectValue placeholder="Eu mesmo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__meu__">Eu mesmo</SelectItem>
              {perfisInternos.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome ?? p.email ?? p.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Últimos 30 dias ({envios.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-12">Carregando...</div>
          ) : envios.length === 0 ? (
            <div className="text-center text-fg4 py-12">Sem envios nos últimos 30 dias.</div>
          ) : (
            <div className="divide-y">
              {envios.map(env => {
                const status = STATUS_COLORS[env.status]
                const canReenv = podeReenviar(env)
                return (
                  <div
                    key={env.id}
                    className="flex items-center gap-4 px-5 py-3"
                  >
                    <div className="shrink-0">{canalIcon(env.canal)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-fg2 font-medium truncate">
                        {tipoLabel(env.tipo)}
                        {env.subject && <span className="text-fg4"> · {env.subject}</span>}
                      </p>
                      <p className="text-xs text-fg4">
                        {formatDateTime(env.sent_at)}
                        {env.reenviado_em && (
                          <span className="ml-1">· reenviada {formatDateTime(env.reenviado_em)}</span>
                        )}
                      </p>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: status.bg, color: status.color }}
                    >
                      {status.label}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 shrink-0"
                      disabled={!canReenv || reenviar.isPending}
                      onClick={() => reenviar.mutate(env.id)}
                      title={canReenv ? 'Reenviar notificação' : 'Sem permissão para reenviar'}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reenviar
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

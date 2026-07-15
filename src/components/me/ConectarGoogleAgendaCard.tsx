import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useGoogleCalendarStatus,
  useConectarGoogleAgenda,
  useCapturarTokenGoogle,
  useDesconectarGoogleAgenda,
} from '@/hooks/useGoogleCalendar'

/**
 * Card de conexão da Google Agenda em /me → aba Notificações (Phase 999.1 Plan 05).
 * Espelha o layout de InstalarAppCard (bg-card rounded-2xl border p-6).
 *
 * Pitfall 2 (RESEARCH.md): o browser só vê `provider_refresh_token` UMA VEZ,
 * logo após o redirect do consentimento Google voltar para o CRM. Por isso o
 * useEffect abaixo, gated por `?google_linked=1`, dispara a captura exatamente
 * uma vez por mount e depois limpa o query param (Pitfall 3 — não reprocessar
 * em F5).
 */
export function ConectarGoogleAgendaCard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: status, isLoading } = useGoogleCalendarStatus()
  const conectar = useConectarGoogleAgenda()
  const capturar = useCapturarTokenGoogle()
  const desconectar = useDesconectarGoogleAgenda()
  const capturedRef = useRef(false)

  useEffect(() => {
    if (searchParams.get('google_linked') !== '1' || capturedRef.current) return
    capturedRef.current = true
    capturar.mutate(undefined, {
      onSettled: () => {
        const params = new URLSearchParams(searchParams)
        params.delete('google_linked')
        setSearchParams(params, { replace: true })
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isLoading) return null

  const conectado = status?.conectado ?? false
  const expiraEm = status?.expira_em
    ? new Date(status.expira_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null

  return (
    <div className="bg-card rounded-2xl border p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: '#0089ac' }}
        >
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {conectado ? 'Conectado ✅' : 'Conectar Google Agenda'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {conectado
              ? `Bloco automático de follow-up ativo${expiraEm ? ` — token válido até ${expiraEm}` : ''}`
              : 'Receba um bloco automático quando um follow-up estiver vencendo'}
          </p>
        </div>
      </div>

      {conectado ? (
        <Button
          variant="outline"
          onClick={() => desconectar.mutate()}
          disabled={desconectar.isPending}
        >
          Desconectar
        </Button>
      ) : (
        <Button
          onClick={() => conectar.mutate()}
          disabled={conectar.isPending}
          className="gap-2"
          style={{ backgroundColor: '#0089ac', color: '#fff' }}
        >
          <Calendar className="w-4 h-4" />
          Conectar Google Agenda
        </Button>
      )}
    </div>
  )
}

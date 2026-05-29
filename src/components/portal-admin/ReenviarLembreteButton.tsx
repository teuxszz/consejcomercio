import { useState, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { AprovacaoPendente } from '@/hooks/useAprovacoesPendentes'

// Phase 7 — Plan 04b — Botão "Reenviar lembrete" no dashboard (D-12).
//
// Cooldown 1h via localStorage — UX visual; backend não enforça MVP porque
// coord+ é trusted role (T-07-12b mitigation).
//
// Dispara edge function notify-aprovacao-evento com:
//   - evento='aprovacao_stale' (reusa fluxo do cron stale; usa mesma lógica de
//     prefs.documentos.email/push do helper sendNotificacaoAprovacao)
//   - destinatario_perfil_id = perfil do CLIENTE (não do consultor)
//   - skip_slack=true (Plan 02 BLOCKER #3 fix: handler propaga p/ helper)
//
// Resultado: cliente recebe email + push (se prefs ativas), sem ping no Slack.

const COOLDOWN_MS = 60 * 60 * 1000 // 1h

function cooldownKey(docId: string) {
  return `consej:reenviar:${docId}`
}

export function ReenviarLembreteButton({ doc }: { doc: AprovacaoPendente }) {
  const [disabled, setDisabled] = useState(false)
  const [remainMin, setRemainMin] = useState(0)

  useEffect(() => {
    const ts = Number(localStorage.getItem(cooldownKey(doc.id)) ?? 0)
    const elapsed = Date.now() - ts
    if (elapsed < COOLDOWN_MS) {
      setDisabled(true)
      setRemainMin(Math.ceil((COOLDOWN_MS - elapsed) / 60_000))
      const t = setTimeout(() => setDisabled(false), COOLDOWN_MS - elapsed)
      return () => clearTimeout(t)
    }
  }, [doc.id])

  const handleClick = async () => {
    try {
      // Buscar perfil do CLIENTE (tipo='cliente' E cliente_id=doc.cliente_id).
      const { data: perfilCliente, error: perfilErr } = await supabase
        .from('perfis')
        .select('id')
        .eq('cliente_id', doc.cliente_id)
        .eq('tipo', 'cliente')
        .maybeSingle()
      if (perfilErr) throw perfilErr
      if (!perfilCliente) throw new Error('Cliente sem perfil vinculado')

      // Edge function notify-aprovacao-evento — payload.skip_slack=true (BLOCKER #3
      // Plan 02 fix) propaga para sendNotificacaoAprovacao({ skipSlack: true }).
      const { error: invokeErr } = await supabase.functions.invoke('notify-aprovacao-evento', {
        body: {
          evento: 'aprovacao_stale',
          doc_id: doc.id,
          cliente_id: doc.cliente_id,
          destinatario_perfil_id: (perfilCliente as { id: string }).id,
          comentario_cliente: null,
          skip_slack: true,
        },
      })
      if (invokeErr) throw invokeErr

      localStorage.setItem(cooldownKey(doc.id), String(Date.now()))
      setDisabled(true)
      setRemainMin(60)
      toast.success('Lembrete enviado ao cliente')
      setTimeout(() => setDisabled(false), COOLDOWN_MS)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reenviar lembrete')
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={disabled}>
      <Bell className="w-4 h-4 mr-1" />
      {disabled ? `Aguarde ${remainMin}min` : 'Reenviar lembrete'}
    </Button>
  )
}

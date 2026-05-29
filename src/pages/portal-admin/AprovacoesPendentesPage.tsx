import { useAprovacoesPendentes } from '@/hooks/useAprovacoesPendentes'
import { BucketUsageBanner } from '@/components/portal-admin/BucketUsageBanner'
import { ReenviarLembreteButton } from '@/components/portal-admin/ReenviarLembreteButton'
import { RequireRole } from '@/components/shared/RequireRole'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Phase 7 — Plan 04b — Dashboard /portal-admin/aprovacoes-pendentes (D-11).
//
// RLS faz role-aware filtering automaticamente (useAprovacoesPendentes não
// filtra em código): coord+ vê todos; consultor vê só docs onde
// clientes.responsavel_id=auth.uid(). Sidebar deixa o link visível a todos.

const TAG_LABEL: Record<string, string> = {
  proposta: 'Proposta',
  contrato: 'Contrato',
  relatorio: 'Relatório',
  outro: 'Outro',
}

export function AprovacoesPendentesPage() {
  const { data: docs = [], isLoading } = useAprovacoesPendentes()

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">Aprovações pendentes</h1>

      <RequireRole atLeast="coordenador" fallback={null}>
        <BucketUsageBanner />
      </RequireRole>

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-10 rounded animate-pulse"
                style={{ background: 'var(--alpha-bg-sm)' }}
              />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <p className="p-8 text-center text-xs text-muted-foreground">
            Nenhuma aprovação pendente.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-xs text-muted-foreground"
                style={{ borderColor: 'var(--alpha-border)' }}
              >
                <th className="px-4 py-2 text-left font-medium">Cliente</th>
                <th className="px-4 py-2 text-left font-medium">Documento</th>
                <th className="px-4 py-2 text-left font-medium">Tag</th>
                <th className="px-4 py-2 text-left font-medium">Versão</th>
                <th className="px-4 py-2 text-left font-medium">Enviado</th>
                <th className="px-4 py-2 text-left font-medium">Consultor</th>
                <th className="px-4 py-2 text-left font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--alpha-border)' }}>
              {docs.map(d => (
                <tr key={d.id} className="hover:bg-[var(--alpha-bg-xs)] transition-colors">
                  <td className="px-4 py-3">{d.cliente?.nome ?? '—'}</td>
                  <td className="px-4 py-3 truncate max-w-xs">{d.nome_arquivo}</td>
                  <td className="px-4 py-3 text-xs">{TAG_LABEL[d.tag] ?? d.tag}</td>
                  <td className="px-4 py-3 text-xs">v{d.versao}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(d.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {d.cliente?.perfil_responsavel?.nome ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ReenviarLembreteButton doc={d} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

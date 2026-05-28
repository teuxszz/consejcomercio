---
phase: 07-client-portal-expansion
plan: 04b
type: execute
wave: 5
depends_on: [07-04a]
files_modified:
  - src/hooks/useAprovacoesPendentes.ts
  - src/hooks/useBucketUsage.ts
  - supabase/migrations/039_bucket_usage_function.sql
  - src/components/portal-admin/BucketUsageBanner.tsx
  - src/components/portal-admin/ReenviarLembreteButton.tsx
  - src/components/configuracoes/ConfigDiasAprovacao.tsx
  - src/pages/portal-admin/AprovacoesPendentesPage.tsx
  - src/pages/ConfiguracoesPage.tsx
  - src/hooks/useConfiguracoes.ts
  - src/components/layout/Sidebar.tsx
  - src/router.tsx
  - tests/rls/cliente_docs.test.ts
  - tests/rls/cliente_docs_storage.test.ts
  - tests/e2e/cliente-docs-flow.spec.ts
autonomous: false
requirements: [PORTAL-04]
user_setup:
  - service: supabase-migration
    why: "Migration 039 (bucket_usage_bytes function) precisa ser aplicada via Studio (mesmo tech-debt das anteriores)"
    dashboard_config:
      - task: "Aplicar migration 039_bucket_usage_function.sql"
        location: "https://supabase.com/dashboard/project/wfnriqwkzdazdbuzbyug/sql/new"

must_haves:
  truths:
    - "/portal-admin/aprovacoes-pendentes acessível por consultor (vê só dos seus via RLS) e coord+ (vê todos)"
    - "Dashboard mostra colunas Cliente / Doc / Tag / Versão / Enviado em / Dias parados / Consultor / Ação"
    - "Botão 'Reenviar lembrete' dispara helper sendNotificacaoAprovacao com skipSlack=true para o CLIENTE (D-12); cooldown 1h visual via localStorage; timeline registra envio"
    - "Bucket usage banner (coord+ only via RequireRole) mostra X MB / 1024 MB; warning visual se > 80% (~820 MB)"
    - "**ConfigDiasAprovacao** em /configuracoes — coord+ ajusta `configuracoes.metas.dias_para_aprovacao_pendente` (WARNING #2 revision iter 2 — D-13 UI faltava)"
    - "Sidebar grupo CRESCIMENTO ganha entry 'Aprovações Pendentes' (todos veem; RLS filtra)"
    - "UAT manual 8 itens (VALIDATION.md §Manual-Only) executado com sign-off"
    - "Tests RLS + E2E populados (substituem it.todo / test.skip de Plan 01b)"
  artifacts:
    - path: "src/hooks/useAprovacoesPendentes.ts"
      provides: "Hook query role-aware via RLS"
      exports: ["useAprovacoesPendentes"]
    - path: "src/hooks/useBucketUsage.ts"
      provides: "RPC bucket_usage_bytes query"
      exports: ["useBucketUsage"]
    - path: "supabase/migrations/039_bucket_usage_function.sql"
      provides: "public.bucket_usage_bytes(text) SQL function"
      contains: "SUM((metadata->>'size')::bigint)"
    - path: "src/components/portal-admin/BucketUsageBanner.tsx"
      provides: "Banner cyan/amber/red conforme % uso; só renderiza se coord+"
      contains: "useBucketUsage"
    - path: "src/components/portal-admin/ReenviarLembreteButton.tsx"
      provides: "Botão + cooldown 1h localStorage (D-12)"
      contains: "skip_slack"
    - path: "src/components/configuracoes/ConfigDiasAprovacao.tsx"
      provides: "Input number + slider para coord+ ajustar dias_para_aprovacao_pendente (WARNING #2 revision iter 2 D-13 UI)"
      contains: "dias_para_aprovacao_pendente"
    - path: "src/pages/portal-admin/AprovacoesPendentesPage.tsx"
      provides: "Dashboard role-aware via RLS, table + ações"
      contains: "useAprovacoesPendentes"
  key_links:
    - from: "src/pages/portal-admin/AprovacoesPendentesPage.tsx"
      to: "src/hooks/useAprovacoesPendentes.ts"
      via: "query + table rendering"
      pattern: "useAprovacoesPendentes"
    - from: "ReenviarLembreteButton click"
      to: "edge function notify-aprovacao-evento (com skip_slack:true no payload — Plan 02 BLOCKER #3)"
      via: "supabase.functions.invoke"
      pattern: "skip_slack.*true"
    - from: "ConfigDiasAprovacao save"
      to: "configuracoes.metas.dias_para_aprovacao_pendente via useUpdateConfiguracoes"
      via: "jsonb_set ou client-side merge + UPDATE"
      pattern: "dias_para_aprovacao_pendente"
---

<objective>
**Slice 4b — Dashboard pendentes + Bucket monitoring + Config UI + Tests RLS/E2E + UAT**

Plan 04 original foi splitado (BLOCKER #4 revision iter 2). Esta metade fecha o phase com:

- Dashboard `/portal-admin/aprovacoes-pendentes` (Coord+ vê tudo; consultor vê só seus via RLS)
- BucketUsageBanner (RLS coord+ via RequireRole) + migration 039 (RPC bucket_usage_bytes)
- ReenviarLembreteButton (cooldown 1h localStorage; invoca notify-aprovacao-evento com skip_slack=true — D-12)
- **ConfigDiasAprovacao em /configuracoes** (WARNING #2 revision iter 2 — D-13 UI faltava)
- Sidebar grupo CRESCIMENTO entry "Aprovações Pendentes"
- Tests RLS + E2E populados (substituem it.todo de Plan 01b)
- Migration 039 apply manual
- UAT 8 itens manual

**Autonomous: false** porque inclui (1) checkpoint manual de migration 039 apply e (2) UAT.

Output: phase 7 totalmente live e validada.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-client-portal-expansion/07-04a-SUMMARY.md
@.planning/phases/07-client-portal-expansion/07-CONTEXT.md
@.planning/phases/07-client-portal-expansion/07-RESEARCH.md
@.planning/phases/07-client-portal-expansion/07-PATTERNS.md
@.planning/phases/07-client-portal-expansion/07-VALIDATION.md

@src/hooks/useLeads.ts
@src/hooks/useClienteDocs.ts
@src/hooks/useConfiguracoes.ts
@src/components/shared/RequireRole.tsx
@src/pages/AdocaoPage.tsx
@src/pages/ConfiguracoesPage.tsx
@src/components/layout/Sidebar.tsx
@src/router.tsx
@src/lib/supabase.ts
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Coord+/consultor invoke notify-aprovacao-evento via reenviar | Edge function exige Bearer WEBHOOK_APROVACAO_SECRET OR via supabase.functions.invoke (auth automático com user JWT — alternativa) |
| RLS cliente_docs SELECT pendentes | Coord+ vê tudo; consultor vê só responsavel_id; cliente vê só own |
| ConfigDiasAprovacao UPDATE configuracoes.metas | useUpdateConfiguracoes já existente; RLS configurada limita coord+ writes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-12b | DoS/Spam | Reenviar lembrete em rajada | mitigate | Cooldown visual 1h via localStorage (D-12). Backend não enforça MVP — coord+ é trusted role |
| T-07-13 | Information Disclosure | Banner uso bucket vaza para usuários comuns | mitigate | RequireRole atLeast="coordenador" envolve BucketUsageBanner. RPC bucket_usage_bytes é SECURITY DEFINER (todos podem chamar) mas só coord+ vê o componente |
| T-07-15 (novo) | Elevation | Consultor ajusta dias_para_aprovacao_pendente | mitigate | ConfigDiasAprovacao envolto em RequireRole atLeast='coordenador'; mutação via useUpdateConfiguracoes (RLS configurada filtra) |
</threat_model>

<tasks>

<task type="auto" tdd="false">
  <name>Task 4b-1: useAprovacoesPendentes hook + useBucketUsage hook + migration 039 (escrita)</name>
  <files>
    src/hooks/useAprovacoesPendentes.ts,
    src/hooks/useBucketUsage.ts,
    supabase/migrations/039_bucket_usage_function.sql
  </files>
  <read_first>
    @src/hooks/useLeads.ts
    @src/lib/query-keys.ts
    @.planning/phases/07-client-portal-expansion/07-RESEARCH.md
  </read_first>
  <action>
    **useAprovacoesPendentes.ts** (PATTERNS §9 — espelha useLeadsLixeira; RLS faz role-aware filtering):
    ```typescript
    import { useQuery } from '@tanstack/react-query'
    import { supabase } from '@/lib/supabase'
    import { QUERY_KEYS } from '@/lib/query-keys'
    import type { ClienteDoc } from '@/types'

    export interface AprovacaoPendente extends ClienteDoc {
      cliente: {
        id: string
        nome: string
        responsavel_id: string | null
        perfil_responsavel: { nome: string } | null
      }
    }

    export function useAprovacoesPendentes() {
      return useQuery<AprovacaoPendente[]>({
        queryKey: QUERY_KEYS.aprovacoesPendentes.all,
        queryFn: async () => {
          const { data, error } = await supabase
            .from('cliente_docs')
            .select(`
              *,
              cliente:cliente_id (
                id, nome, responsavel_id,
                perfil_responsavel:perfis!responsavel_id (nome)
              )
            `)
            .eq('status', 'pending')
            .eq('requer_aprovacao', true)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })  // mais antigas primeiro (mais críticas)
          if (error) throw error
          return (data ?? []) as unknown as AprovacaoPendente[]
        },
      })
    }
    ```

    **useBucketUsage.ts:**
    ```typescript
    import { useQuery } from '@tanstack/react-query'
    import { supabase } from '@/lib/supabase'
    import { QUERY_KEYS } from '@/lib/query-keys'

    export function useBucketUsage(bucket: string = 'cliente-docs') {
      return useQuery<number>({
        queryKey: QUERY_KEYS.bucketUsage.byBucket(bucket),
        queryFn: async () => {
          const { data, error } = await supabase.rpc('bucket_usage_bytes', { p_bucket: bucket })
          if (error) throw error
          return Number(data ?? 0)
        },
        staleTime: 5 * 60 * 1000,  // 5min (RESEARCH §10)
      })
    }
    ```

    **Migration 039 (RESEARCH §10 linhas 951-963 + Open Q5 RESOLVED):**
    ```sql
    -- Migration 039: bucket_usage_bytes function para banner > 80% (D-06)
    --
    -- SUM(metadata->>'size') em storage.objects por bucket. SECURITY DEFINER permite
    -- chamada por authenticated (sem ler diretamente storage.objects). Banner UI fica
    -- gated por RequireRole atLeast='coordenador' no client.

    CREATE OR REPLACE FUNCTION public.bucket_usage_bytes(p_bucket TEXT)
    RETURNS bigint
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = storage, public
    AS $$
      SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
      FROM storage.objects
      WHERE bucket_id = p_bucket
    $$;

    GRANT EXECUTE ON FUNCTION public.bucket_usage_bytes(TEXT) TO authenticated;
    ```

    Migration 039 será aplicada no Task 4b-5 (checkpoint manual).
  </action>
  <verify>
    <automated>grep -E "useAprovacoesPendentes|useBucketUsage|bucket_usage_bytes" src/hooks/useAprovacoesPendentes.ts src/hooks/useBucketUsage.ts supabase/migrations/039_bucket_usage_function.sql | wc -l | awk '$1 >= 3 { print "OK" }'</automated>
  </verify>
  <done>
    2 hooks + migration 039 escritos. useAprovacoesPendentes confia em RLS para role-aware filter (consultor vê só dos seus; coord+ vê tudo). useBucketUsage staleTime 5min.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4b-2: BucketUsageBanner + ReenviarLembreteButton + ConfigDiasAprovacao (WARNING #2)</name>
  <files>
    src/components/portal-admin/BucketUsageBanner.tsx,
    src/components/portal-admin/ReenviarLembreteButton.tsx,
    src/components/configuracoes/ConfigDiasAprovacao.tsx,
    src/pages/ConfiguracoesPage.tsx
  </files>
  <read_first>
    @src/hooks/useBucketUsage.ts
    @src/components/shared/RequireRole.tsx
    @src/hooks/useClienteDocs.ts
    @src/hooks/useConfiguracoes.ts
    @src/lib/supabase.ts
    @src/pages/ConfiguracoesPage.tsx
  </read_first>
  <action>
    **BucketUsageBanner.tsx:**
    ```tsx
    import { useBucketUsage } from '@/hooks/useBucketUsage'
    import { AlertTriangle } from 'lucide-react'

    const QUOTA_BYTES = 1_073_741_824  // 1 GB free tier
    const WARN_RATIO = 0.8

    export function BucketUsageBanner() {
      const { data: bytes = 0, isLoading } = useBucketUsage('cliente-docs')
      if (isLoading) return null

      const mb = Math.round(bytes / (1024 * 1024))
      const totalMb = Math.round(QUOTA_BYTES / (1024 * 1024))
      const ratio = bytes / QUOTA_BYTES
      const isWarning = ratio > WARN_RATIO

      return (
        <div
          className="p-4 rounded-xl border flex items-center gap-3"
          style={{
            background: isWarning ? 'rgba(239,68,68,0.1)' : 'var(--alpha-bg-sm)',
            borderColor: isWarning ? 'rgba(239,68,68,0.3)' : 'var(--alpha-border)',
          }}
        >
          {isWarning && <AlertTriangle className="w-5 h-5 text-destructive" />}
          <div className="flex-1">
            <p className="text-sm text-foreground">
              Uso do bucket cliente-docs: <strong>{mb} MB</strong> / {totalMb} MB ({Math.round(ratio * 100)}%)
            </p>
            {isWarning && (
              <p className="text-xs text-destructive mt-1">
                Acima de 80% — considerar limpeza de docs antigos ou upgrade de plano
              </p>
            )}
          </div>
        </div>
      )
    }
    ```

    Renderização sempre via RequireRole envolvendo:
    ```tsx
    <RequireRole atLeast="coordenador">
      <BucketUsageBanner />
    </RequireRole>
    ```

    **ReenviarLembreteButton.tsx** (D-12 — cooldown 1h localStorage visual + skip_slack=true conforme BLOCKER #3 Plan 02):
    ```tsx
    import { useState, useEffect } from 'react'
    import { Bell } from 'lucide-react'
    import { Button } from '@/components/ui/button'
    import { supabase } from '@/lib/supabase'
    import { toast } from 'sonner'
    import type { AprovacaoPendente } from '@/hooks/useAprovacoesPendentes'

    const COOLDOWN_MS = 60 * 60 * 1000  // 1h

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
          // D-12: dispara só email + push pro CLIENTE; skipSlack=true via payload.skip_slack
          // O destinatário é o cliente (perfis.cliente_id=doc.cliente_id) — buscar perfil_id do cliente
          const { data: perfilCliente, error: perfilErr } = await supabase
            .from('perfis')
            .select('id')
            .eq('cliente_id', doc.cliente_id)
            .eq('tipo', 'cliente')
            .maybeSingle()
          if (perfilErr || !perfilCliente) throw new Error('Cliente sem perfil vinculado')

          // Edge function notify-aprovacao-evento agora lê payload.skip_slack (BLOCKER #3 Plan 02 fix)
          // e propaga como skipSlack para o helper sendNotificacaoAprovacao.
          const { error: invokeErr } = await supabase.functions.invoke('notify-aprovacao-evento', {
            body: {
              evento: 'aprovacao_stale',  // reusa fluxo de stale para destinatário cliente
              doc_id: doc.id,
              cliente_id: doc.cliente_id,
              destinatario_perfil_id: perfilCliente.id,  // CLIENTE, não consultor
              comentario_cliente: null,
              skip_slack: true,  // Plan 02 handler propaga para sendNotificacaoAprovacao({ skipSlack: true })
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
    ```

    **ConfigDiasAprovacao.tsx (WARNING #2 revision iter 2 — D-13 UI):**
    ```tsx
    import { useState, useEffect } from 'react'
    import { useConfiguracoes, useUpdateConfiguracoes } from '@/hooks/useConfiguracoes'
    import { Button } from '@/components/ui/button'
    import { Input } from '@/components/ui/input'
    import { Label } from '@/components/ui/label'
    import { RequireRole } from '@/components/shared/RequireRole'
    import { toast } from 'sonner'

    export function ConfigDiasAprovacao() {
      const { data: configs } = useConfiguracoes()
      const updateConfigs = useUpdateConfiguracoes()
      const [dias, setDias] = useState<number>(5)

      useEffect(() => {
        const current = (configs?.metas as Record<string, unknown> | null)?.dias_para_aprovacao_pendente
        if (typeof current === 'number') setDias(current)
      }, [configs])

      const handleSave = async () => {
        if (dias < 1 || dias > 60) {
          toast.error('Use um valor entre 1 e 60 dias')
          return
        }
        try {
          const newMetas = { ...(configs?.metas ?? {}), dias_para_aprovacao_pendente: dias }
          await updateConfigs.mutateAsync({ metas: newMetas })
          toast.success('Configuração salva')
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
        }
      }

      return (
        <RequireRole atLeast="coordenador">
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div>
              <Label className="text-sm font-semibold">Dias para considerar aprovação parada</Label>
              <p className="text-xs text-muted-foreground">
                Depois desse prazo sem resposta do cliente, dispara notificação automática ao consultor (D-13).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={60}
                value={dias}
                onChange={e => setDias(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">dias</span>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateConfigs.isPending}
              >
                Salvar
              </Button>
            </div>
          </div>
        </RequireRole>
      )
    }
    ```

    **Plug em ConfiguracoesPage.tsx:** localizar seção apropriada (ex.: bloco "Metas" ou seção própria "Notificações") e adicionar:
    ```tsx
    import { ConfigDiasAprovacao } from '@/components/configuracoes/ConfigDiasAprovacao'

    // ... no JSX, dentro de tab/seção apropriada:
    <section className="space-y-4">
      <h2 className="text-base font-semibold">Aprovação de documentos</h2>
      <ConfigDiasAprovacao />
    </section>
    ```

    Se `useConfiguracoes` ainda não expõe `useUpdateConfiguracoes` que aceita `{ metas }`, estender o hook (5 linhas) — ou usar pattern existente do projeto.
  </action>
  <verify>
    <automated>grep -E "useBucketUsage|COOLDOWN_MS|skip_slack|dias_para_aprovacao_pendente" src/components/portal-admin/BucketUsageBanner.tsx src/components/portal-admin/ReenviarLembreteButton.tsx src/components/configuracoes/ConfigDiasAprovacao.tsx | wc -l | awk '$1 >= 4 { print "OK" }'</automated>
  </verify>
  <done>
    BucketUsageBanner mostra X MB / 1024 MB e fica warning > 80%. ReenviarLembreteButton cooldown 1h localStorage; invoca notify-aprovacao-evento com skip_slack=true (Plan 02 BLOCKER #3 fix consome) para o CLIENTE perfilId. **ConfigDiasAprovacao em /configuracoes — coord+ ajusta dias_para_aprovacao_pendente (WARNING #2 revision iter 2 — D-13 UI agora existe).**
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4b-3: AprovacoesPendentesPage + rota + Sidebar entry</name>
  <files>
    src/pages/portal-admin/AprovacoesPendentesPage.tsx,
    src/router.tsx,
    src/components/layout/Sidebar.tsx
  </files>
  <read_first>
    @src/pages/AdocaoPage.tsx
    @src/components/layout/Sidebar.tsx
    @src/router.tsx
    @src/hooks/useAprovacoesPendentes.ts
    @src/components/portal-admin/BucketUsageBanner.tsx
    @src/components/portal-admin/ReenviarLembreteButton.tsx
    @src/components/shared/RequireRole.tsx
  </read_first>
  <action>
    **AprovacoesPendentesPage.tsx** (PATTERNS §14 — espelha AdocaoPage):
    ```tsx
    import { useAprovacoesPendentes } from '@/hooks/useAprovacoesPendentes'
    import { BucketUsageBanner } from '@/components/portal-admin/BucketUsageBanner'
    import { ReenviarLembreteButton } from '@/components/portal-admin/ReenviarLembreteButton'
    import { RequireRole } from '@/components/shared/RequireRole'
    import { formatDistanceToNow } from 'date-fns'
    import { ptBR } from 'date-fns/locale'

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

          <RequireRole atLeast="coordenador">
            <BucketUsageBanner />
          </RequireRole>

          <div className="rounded-xl border border-border bg-card">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--alpha-bg-sm)' }} />
                ))}
              </div>
            ) : docs.length === 0 ? (
              <p className="p-8 text-center text-xs text-muted-foreground">
                Nenhuma aprovação pendente.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground" style={{ borderColor: 'var(--alpha-border)' }}>
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
                    <tr key={d.id}>
                      <td className="px-4 py-3">{d.cliente?.nome ?? '—'}</td>
                      <td className="px-4 py-3 truncate max-w-xs">{d.nome_arquivo}</td>
                      <td className="px-4 py-3 text-xs">{TAG_LABEL[d.tag] ?? d.tag}</td>
                      <td className="px-4 py-3 text-xs">v{d.versao}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(d.created_at), { addSuffix: true, locale: ptBR })}
                      </td>
                      <td className="px-4 py-3 text-xs">{d.cliente?.perfil_responsavel?.nome ?? '—'}</td>
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
    ```

    **router.tsx:** adicionar rota CRM (child de AppLayout):
    ```typescript
    { path: 'portal-admin/aprovacoes-pendentes', element: <AprovacoesPendentesPage /> },
    ```

    **Sidebar.tsx** — adicionar entry no grupo CRESCIMENTO:
    ```typescript
    {
      label: 'CRESCIMENTO',
      items: [
        { to: '/indicacoes',    label: 'Indicações',    icon: Share2         },
        { to: '/parceiros',     label: 'Parceiros',     icon: Handshake      },
        { to: '/pos-juniors',   label: 'Pós-Juniors',   icon: GraduationCap  },
        { to: '/portal-admin',  label: 'Portal Tokens', icon: Coins          },
        { to: '/portal-admin/aprovacoes-pendentes', label: 'Aprovações Pendentes', icon: FileText },  // NOVO Slice 4b
      ],
    },
    ```

    Sem RequireRole no nav — RLS filtra (consultor vê suas, coord+ vê tudo, D-11). Banner uso bucket é o único componente coord+ only.
  </action>
  <verify>
    <automated>grep -c "aprovacoes-pendentes\|AprovacoesPendentesPage" src/router.tsx src/components/layout/Sidebar.tsx src/pages/portal-admin/AprovacoesPendentesPage.tsx | awk -F: '{sum+=$2} END { print (sum >= 4 ? "OK" : "MISS " sum) }'</automated>
  </verify>
  <done>
    Página AprovacoesPendentesPage live. Rota /portal-admin/aprovacoes-pendentes registrada. Sidebar grupo CRESCIMENTO ganha entry visível a todos (RLS faz role-aware filter). Banner uso bucket é coord+ only.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4b-4: Popular tests RLS + E2E (substituir it.todo / test.skip de Plan 01b)</name>
  <files>
    tests/rls/cliente_docs.test.ts,
    tests/rls/cliente_docs_storage.test.ts,
    tests/e2e/cliente-docs-flow.spec.ts
  </files>
  <read_first>
    @tests/rls/push_subscriptions.test.ts
    @tests/rls/cliente_docs.test.ts
    @tests/rls/cliente_docs_storage.test.ts
    @tests/e2e/cliente-docs-flow.spec.ts
  </read_first>
  <action>
    **tests/rls/cliente_docs.test.ts:** popular 7 cases (substituir it.todo):
    - cliente login + SELECT cliente_docs WHERE cliente_id próprio → recebe rows; outros cliente_ids → 0 rows
    - cliente login + INSERT em próprio cliente_id + autor_tipo='cliente' + requer_aprovacao=false → sucesso
    - cliente login + INSERT em próprio cliente_id + autor_tipo='cliente' + requer_aprovacao=true → RLS rejeita (D-01)
    - cliente login + UPDATE status='aprovado' em doc do consultor próprio cliente → sucesso (T-07-09)
    - cliente login + UPDATE status='superseded' → RLS rejeita (T-07-09c)
    - consultor login + SELECT vê só docs onde clientes.responsavel_id=auth.uid(); coord+ login → SELECT vê tudo
    - service_role DELETE → permite (necessário para edge functions); usuário comum DELETE → RLS rejeita

    **tests/rls/cliente_docs_storage.test.ts:** popular 4 cases:
    - cliente login + storage.upload em '{próprio_cliente_id}/test.pdf' → sucesso
    - cliente login + storage.upload em '{outro_cliente_id}/test.pdf' → RLS rejeita (T-07-02)
    - cliente login + storage.list bucket → vê só objetos da própria pasta (T-07-08)
    - consultor login + storage.upload em pasta de cliente fora de responsavel → RLS rejeita

    **tests/e2e/cliente-docs-flow.spec.ts:** popular 2 specs (Playwright) — usar projects diretor + consultor + cliente seed via service_role no globalSetup:
    - test 1 — Cliente flow: cliente login → /portal/documentos → arrastar PDF de fixture (Playwright `setInputFiles`) → toast success → assert row em lista
    - test 2 — Consultor approval flow: consultor login → /clientes/<seed-cliente-id> → tab Documentos → upload proposta com Pedir aprovação → cliente login em outro context → /portal/documentos → ver doc + botões → clicar Aprovar → cliente assert toast; consultor (refresh) → status aprovado

    **Fixtures necessárias:** PDF pequeno em `tests/fixtures/sample.pdf` (1KB, não-malicioso). Seed cliente em `tests/e2e/globalSetup.ts` se ainda não existe — pattern Phase 5/6.
  </action>
  <verify>
    <automated>rtk npm run test:rls 2>&1 | grep -E "(Tests|Test Files).*passed"</automated>
  </verify>
  <done>
    cliente_docs.test.ts: 7 cases passando. cliente_docs_storage.test.ts: 4 cases. e2e: 2 specs passando (ou marcados como `test.skip` se ambiente local não tem fixtures cliente; documentar no SUMMARY).
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking-human">
  <name>Task 4b-5 [BLOCKING]: Gabriel aplica migration 039 (bucket_usage_bytes function)</name>
  <what-built>
    Migration 039_bucket_usage_function.sql escrita em Task 4b-1. Precisa ser aplicada em prod
    para o `useBucketUsage` hook funcionar (rpc não existe no DB ainda).
  </what-built>
  <how-to-verify>
    1. Studio → SQL Editor → cole `supabase/migrations/039_bucket_usage_function.sql` → Run
    2. Verificação:
       ```sql
       SELECT proname, prosecdef FROM pg_proc WHERE proname = 'bucket_usage_bytes';
       -- esperado: 1 row, prosecdef=true (SECURITY DEFINER)
       SELECT public.bucket_usage_bytes('cliente-docs');  -- bytes atuais; 0 se bucket vazio
       ```
    3. Teste rápido com usuário autenticado (pode ser via dashboard):
       ```sql
       -- Em uma role authenticated, chamar
       SELECT bucket_usage_bytes('cliente-docs');
       -- esperado: retorna número (não erro de permissão)
       ```

    Se já tem objetos em cliente-docs (subidos no smoke Slice 3), o valor reflete tamanho total.
  </how-to-verify>
  <files>(manual checkpoint — see <how-to-verify> for exact commands and files touched outside repo)</files>
  <action>Execute every numbered step in <how-to-verify> in order; do not skip Studio SQL Editor / CLI / Dashboard tasks. After each step run the verification SQL/curl shown inline.</action>
  <verify><human-check>All inline verification queries / curl invocations in <how-to-verify> return the expected values; capture outputs in the SUMMARY.</human-check></verify>
  <done>Every step in <how-to-verify> completed with the expected output; any anomaly logged in SUMMARY and either fixed before resume or escalated to a follow-up gap-closure plan.</done>
    <resume-signal>Type "approved" após confirmar pg_proc retorna a function + uma chamada returna número. Descreva erro se houver.</resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4b-6 [UAT MANUAL]: 8 itens de VALIDATION.md §Manual-Only verificados em produção</name>
  <what-built>
    Phase 7 completa em prod: migration 037/038/039 aplicadas, bucket+storage RLS+Vault secret
    criados, edge functions deployed, UI cliente + consultor + dashboard + matriz 5×3 + sidebar
    + banner uso bucket + ConfigDiasAprovacao em /configuracoes. Cooldown 1h funcionando, RLS
    testada via tests/rls. D-02 versionamento funcionando (SubirNovaVersaoButton em crm).

    Resta: UAT manual humano dos 8 itens difíceis de automatizar (drag-drop OS real, iPhone
    Safari, signed URL browser behavior, banner > 80% simulation, reenviar lembrete real
    email/push, 5-day stale cron real, MIME spoofing tech-debt aceito, tab navigation).
  </what-built>
  <how-to-verify>
    Executar **cada um dos 8 itens** de `.planning/phases/07-client-portal-expansion/07-VALIDATION.md` §Manual-Only Verifications, em ordem:

    **1. Drag-and-drop from OS desktop (PORTAL-01):**
    - /portal/documentos no Chrome desktop
    - Arrastar PDF do desktop → drop → upload progress visível
    - Confirmar `SELECT * FROM cliente_docs WHERE cliente_id=<id> ORDER BY created_at DESC LIMIT 1` mostra mime_type='application/pdf' + tamanho_bytes correto

    **2. Drag-and-drop iPhone Safari (PORTAL-01):**
    - Abrir portal em Safari iOS 16.4+
    - Tentar drag-drop (geralmente cai pro picker)
    - Confirmar `<input type="file">` fallback abre seletor nativo
    - Upload completa

    **3. Signed URL download (PORTAL-01):**
    - Lista de docs → clicar Baixar
    - DevTools Network tab → request a `.../sign/cliente-docs/...?token=...`
    - Confirmar token expira em 60min (response query string ou JWT exp)
    - Arquivo baixa OR abre em nova aba conforme browser

    **4. Bucket usage banner > 80% (D-06):**
    - Logar como coordenador → /portal-admin/aprovacoes-pendentes
    - Banner mostra X MB / 1024 MB
    - Inspect DOM: classes/styles refletem `isWarning` boolean (cor vermelha + ícone AlertTriangle quando ratio > 0.8)

    **5. Reenviar lembrete dispara email + push (D-12):**
    - Coord+ no dashboard → encontrar doc pendente
    - Clicar Reenviar lembrete
    - Confirmar:
      - Toast success
      - Botão fica disabled com "Aguarde 60min"
      - Cliente (outra sessão/device) recebe email (se prefs.documentos.email=true)
      - Cliente recebe push (se prefs.documentos.push=true E sub ativa)
      - `SELECT * FROM notificacoes_envios WHERE tipo='documentos' AND entidade_id=<doc> ORDER BY created_at DESC LIMIT 5` mostra rows recentes para o cliente

    **6. 5-day stale cron disparo (D-07d, D-10):**
    - Ajustar pg_cron temporariamente:
      ```sql
      SELECT cron.alter_job(
        job_id := (SELECT jobid FROM cron.job WHERE jobname = 'disparar-aprovacoes-stale'),
        schedule := '* * * * *'  -- cada minuto
      );
      ```
    - INSERT cliente_docs fixture com created_at antigo
    - Aguardar 1 min
    - `SELECT * FROM notificacoes_envios WHERE tipo='documentos' AND created_at > now() - interval '5 minutes'` mostra row
    - **REVERTER cron schedule para `'0 11 * * *'`**

    **7. MIME spoofing protection (T-07-04) — TECH-DEBT ACEITO:**
    - Renomear `notepad.exe` para `proposta.pdf`
    - Drag-drop em /portal/documentos
    - Documentar resultado: se bucket bloqueou, OK (defense-in-depth funcionou); se passou, tech-debt explicitamente aceito (D-05 + RESEARCH Open Q7 RESOLVED)

    **8. ClienteDetailPage tab Documentos (PORTAL-02) + ConfigDiasAprovacao + SubirNovaVersaoButton (D-02 BLOCKER #2):**
    - /clientes/<id> direto → ver tab "Documentos" ao lado de outras 5
    - Click → DocsTabConsultor renderiza: Select tag + Checkbox requer_aprovacao + Dropzone + Lista
    - Count na tab atualiza após upload
    - Subir doc com Pedir aprovação=true
    - Em /portal/documentos (cliente) → clicar Solicitar revisão + textarea "ajustar X" → enviar
    - Voltar para /clientes/<id> tab Documentos → confirmar status='revisao_solicitada' visível, comentario_cliente visível
    - **Verificar que SubirNovaVersaoButton aparece para o consultor (autor)** → clicar → file picker → escolher novo PDF
    - Confirmar `SELECT id, versao, parent_doc_id, status FROM cliente_docs WHERE cliente_id=<id> ORDER BY created_at` mostra v1 (status=superseded) + v2 (status=pending, parent_doc_id=v1.id)
    - **Verificar /configuracoes** → coord+ vê seção "Aprovação de documentos" → input dias_para_aprovacao_pendente funciona + salva (WARNING #2)

    **Documentar no SUMMARY:** quais 8 PASS, quais FAIL, observações.
  </how-to-verify>
  <files>(manual checkpoint — see <how-to-verify> for exact commands and files touched outside repo)</files>
  <action>Execute every numbered step in <how-to-verify> in order; do not skip Studio SQL Editor / CLI / Dashboard tasks. After each step run the verification SQL/curl shown inline.</action>
  <verify><human-check>All inline verification queries / curl invocations in <how-to-verify> return the expected values; capture outputs in the SUMMARY.</human-check></verify>
  <done>Every step in <how-to-verify> completed with the expected output; any anomaly logged in SUMMARY and either fixed before resume or escalated to a follow-up gap-closure plan.</done>
    <resume-signal>Type "approved" após cobrir os 8 itens. Para cada FAIL, anotar bug + criar follow-up gap-closure plan via `/gsd-plan-phase 07 --gaps` ou tratar inline conforme severidade. Descreva qualquer item que falhe ou que tenha comportamento inesperado.</resume-signal>
</task>

</tasks>

<verification>
```bash
# Tests verdes
rtk npm test
rtk npm run test:rls
rtk npm run test:e2e -- tests/e2e/cliente-docs-flow.spec.ts

# TS + lint
rtk npx tsc -b
rtk npm run lint

# Migration 039 schema (live, após Task 4b-5)
# SELECT proname FROM pg_proc WHERE proname = 'bucket_usage_bytes';

# UAT manual (Task 4b-6): 8 itens VALIDATION.md
```
</verification>

<success_criteria>
- [ ] useAprovacoesPendentes + useBucketUsage hooks live
- [ ] Migration 039 aplicada (bucket_usage_bytes function)
- [ ] BucketUsageBanner (coord+ only via RequireRole) mostra MB/totalMB + warning > 80%
- [ ] ReenviarLembreteButton cooldown 1h via localStorage + invoca notify-aprovacao-evento com skip_slack=true para o CLIENTE perfilId (consome BLOCKER #3 do Plan 02)
- [ ] **ConfigDiasAprovacao em /configuracoes (coord+ only) ajusta configuracoes.metas.dias_para_aprovacao_pendente (WARNING #2 revision iter 2)**
- [ ] AprovacoesPendentesPage live em /portal-admin/aprovacoes-pendentes (RLS faz role-aware filter)
- [ ] Sidebar grupo CRESCIMENTO ganha entry "Aprovações Pendentes" (todos veem via nav; RLS filtra dados)
- [ ] tests/rls/cliente_docs.test.ts: 7 casos passando
- [ ] tests/rls/cliente_docs_storage.test.ts: 4 casos passando
- [ ] tests/e2e/cliente-docs-flow.spec.ts: 2 specs (cliente flow + approval flow)
- [ ] UAT manual 8 itens executados com sign-off (Task 4b-6) — incluindo D-02 versionamento via SubirNovaVersaoButton
- [ ] PORTAL-04 completo (dashboard pendentes + cron stale + reenviar lembrete + banner uso bucket + UI D-13)
- [ ] Threats T-07-12b, T-07-13, T-07-15 mitigados conforme threat_model
</success_criteria>

<output>
Create `.planning/phases/07-client-portal-expansion/07-04b-SUMMARY.md`:
- Lista de hooks + componentes + páginas adicionados
- Migration 039 aplicada (verificação SQL)
- Skip_slack passthrough em notify-aprovacao-evento — confirmado funcionando (consumindo BLOCKER #3 do Plan 02)
- Tests RLS results (7+4 cases)
- E2E results
- **UAT 8 itens individuais** com PASS/FAIL/OBS por item — incluindo D-02 SubirNovaVersaoButton + ConfigDiasAprovacao
- Tech-debt remanescente (MIME sniffing real — esperado, aceito conforme RESEARCH Open Q7 RESOLVED)
- Próximo: `/gsd-verify-work 07` ou close phase via /gsd-end-phase
</output>

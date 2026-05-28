# Phase 7: Client Portal Expansion — Research

## RESEARCH COMPLETE

**Researched:** 2026-05-28
**Domain:** Supabase Storage (private bucket + RLS) + drag-drop UI + multi-canal notif helper extension
**Confidence:** HIGH (90%+ findings verified contra codebase Phase 5/6 + docs Supabase oficiais)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Aprovação configurável por upload. Consultor marca checkbox `Pedir aprovação`. Tags = rótulo informativo, não gate de fluxo. Cliente nunca pode marcar próprio doc como `requer_aprovacao`.
- **D-02:** Histórico de versões: `versao integer DEFAULT 1` + `parent_doc_id uuid REFERENCES cliente_docs(id)`. v1 vira `status='superseded'` quando v2 chega. UI: badge "v2 (atual)" + dropdown "Ver versões anteriores".
- **D-03:** Bidirecional. Cliente sobe via `/portal/documentos`. Consultor via `/clientes/:id/docs`. `autor_id` + `autor_tipo` text CHECK IN ('interno','cliente'). Cliente uploads nunca recebem botões aprovação.
- **D-04:** Bucket `cliente-docs` privado (`public=false`). Path `{cliente_id}/{doc_id}.{ext}`. Download via signed URL 60min. RLS isola por cliente_id usando `perfis.cliente_id` (existe desde migration 015).
- **D-05:** Whitelist MIME: pdf, docx, doc, odt, jpg, jpeg, png, webp + max 10MB. Validação frontend (input accept + size check) + backend (RLS de tamanho via bucket config).
- **D-06:** Sem hard cap per-cliente. Monitora total bucket. Banner warning > 80% (~820 MB) só coord+.
- **D-07:** 4 eventos disparam multi-canal: (a) cliente aprovou, (b) cliente pediu revisão, (c) cliente subiu doc, (d) 5+ dias sem resposta.
- **D-08:** Tipo único `documentos` em `preferencias_notif`. Matriz UI cresce de 4×3 → **5×3** (15 switches).
- **D-09:** Helper `_shared/aprovacoes.ts` espelha email.ts/push.ts. `sendNotificacaoAprovacao({ perfilId, evento, docId, payload })` com Promise.allSettled paralelizando Slack+Email+Push. **Reinterpreta PORTAL-03**.
- **D-10:** Eventos (a)(b)(c) **trigger-driven** (Postgres trigger em UPDATE/INSERT de `cliente_docs`). Evento (d) **cron-driven** — nova edge function `notify-aprovacoes-stale` via pg_cron.
- **D-11:** Dashboard `/portal-admin/aprovacoes-pendentes` role-aware. Coord+ vê tudo; consultor vê só dos seus.
- **D-12:** "Reenviar lembrete" dispara email + push pro **cliente** (Slack OFF). Timeline registra envio. Cooldown 1h apenas visual (cliente-side timer).
- **D-13:** Threshold "5+ dias" configurável via `configuracoes.dias_para_aprovacao_pendente` (default 5).
- **D-14:** Migration 037 cria `cliente_docs` + estende `preferencias_notif` + adiciona `configuracoes.dias_para_aprovacao_pendente`. Bucket criado fora migration (CLI ou Dashboard).
- **D-15:** `storage.objects` RLS policies aplicadas via Dashboard SQL Editor (fora migration sequencial).
- **D-16:** Types extension: `TipoNotif += 'documentos'`, `PreferenciasNotif.documentos`, `ClienteDoc`, `AutorDoc`, `TagDoc`, `StatusDoc`.

### Claude's Discretion

- Forma exata da signed URL (D-04) — client-side `.createSignedUrl(path, 3600)` recomendado.
- MIME sniffing real vs extensão only (D-05) — extensão + frontend `file.type` apenas MVP.
- Query "uso total bucket" (D-06) — planner decide entre cron diário OU função SQL on-demand.
- Cooldown lembrete (D-12) — 1h visual only.
- Timeline UI do doc (D-12) — modal? expand inline? side drawer? Planner decide. Pattern: `ActivityTimeline`.
- Soft delete vs hard delete (D-14 `deleted_at`) — soft delete recomendado mas planner avalia.
- Tab order em `ClienteDetailPage` — planner decide.
- `perfis.cliente_id` existence check — **confirmado: existe desde migration 015** (validado neste research).

### Deferred Ideas (OUT OF SCOPE)

Diff lado-a-lado de versões; assinatura digital criptográfica; comentários inline no PDF; OCR; DocuSign/ClickSign; hard cap per-cliente; cron de cleanup automático; MIME sniffing real (magic bytes); cooldown enforced backend; comentário rich-text; push pro cliente nos 4 eventos (b/c/d); preview inline de PDF.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PORTAL-01 | Página `/portal/documentos` com drag-and-drop upload + Storage `cliente-docs` (RLS por cliente_id) | Bucket creation CLI/Dashboard + storage.objects RLS via `(storage.foldername(name))[1] = perfis.cliente_id` (verificado em Pattern §Storage RLS); drag-drop via `react-dropzone@15.0.0` ou HTML5 nativo (recomendação: react-dropzone) |
| PORTAL-02 | Interno faz upload em `/clientes/:id/docs` (tab nova) com tag | Reutiliza `usePerfis.ts:87` pattern + tab no `ClienteDetailPage` (já usa shadcn Tabs); RLS interno: `is_interno() AND (responsavel_id = auth.uid() OR is_at_least('coordenador'))` |
| PORTAL-03 | Cliente aprova/solicita revisão; multi-canal dispara | Reinterpretado D-09: helper `_shared/aprovacoes.ts` espelha email.ts/push.ts; Postgres trigger ON UPDATE `cliente_docs` status chama edge function via pg_net.http_post; reusa idempotência UNIQUE em `notificacoes_envios` |
| PORTAL-04 | Dashboard pendentes + reenviar lembrete | Cron `notify-aprovacoes-stale` schedule diário (pattern `031_cron_renovacoes.sql`); query filter por `dias_para_aprovacao_pendente`; RLS role-aware via `is_at_least('coordenador')` |

</phase_requirements>

---

## Summary

Phase 7 expande o portal do cliente com **fluxo bidirecional de documentos** + **multi-canal notif para aprovações**. A engenharia se decompõe em 4 sub-domínios, todos com paralelos diretos no codebase atual:

1. **Storage privado + RLS** — espelha migration 009 (avatars), porém `public=false` e download via signed URL 60min. RLS no `storage.objects` usa `(storage.foldername(name))[1] = perfis.cliente_id::text` para isolamento por cliente, com expansão role-aware para internos via `public.is_at_least('coordenador')`.

2. **Drag-and-drop UI** — recomendação **`react-dropzone@15.0.0`** (verificado: publicado Fev/2026, ~20KB minified). Pode-se construir nativo HTML5 mas react-dropzone resolve corner cases (touch/iOS, getOpenFilePicker fallback, drag reject UX, accept MIME matching). Peer-dep declarado para React 18; o repo já usa `legacy-peer-deps=true` para React 19 (confirmado em `.npmrc` + STACK.md), não há blocker.

3. **Multi-canal helper extension** — `_shared/aprovacoes.ts` espelha 1:1 `_shared/email.ts` e `_shared/push.ts` (já existentes). Promise.allSettled paralelizando os 3 canais. `TipoNotif` estendido para `'documentos'` em 3 locais: migration handle_new_user, `_shared/perfis.ts`, `src/types/index.ts`. Matriz UI 4×3 → 5×3 é mecânico (adicionar 1 linha no array `TIPOS` em `NotificacoesPanel.tsx`).

4. **Triggers + cron** — eventos a/b/c (cliente aprovou / pediu revisão / subiu doc) são **postgres triggers** ON INSERT/UPDATE de `cliente_docs` que invocam edge function via `pg_net.http_post` (pattern de migration 031). Evento d (5+ dias stale) é **pg_cron diário** que itera SELECT WHERE `(now() - sent_at) > dias_para_aprovacao_pendente` e chama edge function (pattern de `cron_disparar_renovacoes`). Idempotência herdada via UNIQUE em `notificacoes_envios`.

**Primary recommendation:** Reusar TODOS os patterns Phase 5/6 sem desvio. Mudanças isoladas e mecânicas. Risk principal é o **bucket creation fora de migration** (manual, fácil de esquecer) — mitigar com checkpoint no plano.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File upload / signed URL geração | Browser / Client | Database (RLS) | `supabase-js` `.upload()` e `.createSignedUrl()` rodam direto do browser com anon key; RLS no backend valida path scope. Padrão idêntico ao `useUploadAvatar` (`src/hooks/usePerfis.ts:82-93`). |
| Path validation + MIME whitelist | Browser / Client | Database (bucket config + RLS) | UX rápido (rejeição antes do upload). Backend reforça via `allowed_mime_types` + `file_size_limit` em `storage.buckets` (config bucket). Defense-in-depth. |
| Approval state machine (pending → aprovado/revisao_solicitada) | Database (RLS + CHECK constraints) | Browser / Client (mutations) | Estado canônico no Postgres com CHECK no `status`; client emite UPDATE via TanStack Query mutation. RLS WITH CHECK garante que só cliente do mesmo `cliente_id` muda status. |
| Notification fanout (a/b/c) | Database (triggers) | Edge Function (Deno) | Postgres trigger em UPDATE/INSERT chama `net.http_post` para edge function (pattern Phase 5). Edge function carrega `_shared/aprovacoes.ts` helper que faz fanout para Slack/Email/Push. |
| Stale detection (d) | Database (pg_cron) | Edge Function (Deno) | `pg_cron` agenda função SQL diária que filtra docs pendentes > N dias e enfileira HTTP POSTs. Idempotência via UNIQUE notificacoes_envios. |
| Dashboard `/portal-admin/aprovacoes-pendentes` query | Database (RLS) | Browser / Client (TanStack Query) | RLS no `cliente_docs` filtra automaticamente (consultor vê só seus; coord+ vê tudo). Hook `useAprovacoesPendentes()` apenas SELECT. |
| Reenviar lembrete (D-12) | Browser / Client (mutation) | Edge Function (Deno) | Botão dispara mutation que chama edge function `notify-aprovacoes-stale` com perfil_id=cliente específico. Cooldown 1h é visual only (localStorage timestamp). |
| File preview / download | Browser / Client | — | `.createSignedUrl()` gerado no client; `window.open()` ou `<a download>` para baixar. Sem preview inline (deferred). |

---

## Standard Stack

### Core (já no projeto, apenas reusar)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.99.x [VERIFIED: package.json] (latest 2.106.2 [VERIFIED: npm view]) | Storage upload + signed URL + RLS-respecting queries | Singleton já configurado em `src/lib/supabase.ts`; pattern de upload já estabelecido em `usePerfis.ts:87` |
| `@tanstack/react-query` | 5.90.x [VERIFIED: package.json] | Hooks `useClienteDocs`, `useUploadClienteDoc`, `useAprovarDoc`, `useSolicitarRevisaoDoc`, `useAprovacoesPendentes` | Pattern canônico no projeto (todos os hooks `use*.ts`) |
| `zod` | 4.3.x [VERIFIED: package.json] | Schema validação file upload form (tags + checkbox `requer_aprovacao`) | Padrão estabelecido (todos os modais usam zod + react-hook-form) |
| `react-hook-form` | 7.71.x [VERIFIED: package.json] | Form state do upload modal | Mesmo padrão de `NewLeadModal.tsx` |
| `sonner` | 2.0.x [VERIFIED: package.json] | toast.success / toast.error em upload, aprovação, lembrete | Padrão estabelecido |
| `lucide-react` | 0.577.x [VERIFIED: package.json] | Ícones `Upload`, `FileText`, `CheckCircle2`, `MessageSquareWarning`, `Clock`, `Download` | Já em uso |
| `date-fns` | 4.1.x [VERIFIED: package.json] | `formatDistanceToNow(date, { locale: ptBR })` para "há 3 dias" no dashboard | Já em uso em `PortalAdminPage` |

### Supporting (uma nova dep recomendada)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-dropzone` | **15.0.0** [VERIFIED: npm view, publicado 2026-02-10] | Drag-and-drop file picker em `/portal/documentos` e modal upload do consultor | Para PORTAL-01 e PORTAL-02. Alternativa nativa HTML5 funciona mas tem corner cases (iOS touch, dragenter/leave counter bug, accept matching). Tamanho: ~20KB. Peer dep React >=16.8 OR 18.0.0 (aviso peer para React 19 — repo já usa `legacy-peer-deps=true` per .npmrc). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-dropzone` | HTML5 native (`<input type="file">` + dragenter/dragover/drop) | Native: zero deps, mas é fácil errar a contagem de drag events (entrar/sair child elements conta a mais), iOS Safari falta `dataTransfer.items` em alguns casos, accept matching é manual. Para MVP onde drag-and-drop precisa "funcionar bem", `react-dropzone` ganha. |
| `react-dropzone` | `@uppy/react` | Uppy é overkill (multi-provider, S3, tus) para MVP simples |
| Pop-up window open(signed_url) | `<a href={url} download={filename}>` | `<a>` clica + download keep filename; ideal para UX. window.open abre tab nova (bom para PDF preview, mas exige novo gesto para download) |
| `.createSignedUrl()` client-side | Edge function proxy `get-signed-url` | Client-side é mais simples (1 round trip a menos) e Auth context do `supabase-js` já garante RLS. Edge function só ganha sentido se precisássemos rate-limit ou logging extra |
| Cron diário stale check | Polling on page mount | Cron escala melhor; polling perde notif se ninguém abre o dashboard. Pattern Phase 5 já estabelecido. |

**Installation:**
```bash
npm install react-dropzone
```

(Apenas 1 nova dep. Tudo restante é reuso.)

**Version verification:**
- `react-dropzone@15.0.0` confirmado via `npm view react-dropzone version` — publicado 2026-02-10 (homepage github.com/react-dropzone/react-dropzone).
- `@supabase/supabase-js@2.106.2` é o latest; projeto tem 2.99.x (gap pequeno, API estável; **não recomendado bump** nesta phase para não introduzir risk não-relacionado).

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `react-dropzone` | npm | 10+ anos | ~3.5M/sem [WebSearch citation] | github.com/react-dropzone/react-dropzone | not run (slopcheck indisponível no ambiente Windows com pip sem `--break-system-packages` permitido) | [ASSUMED] — verificar checkpoint antes de install |

**slopcheck status:** Não executado nesta research (ambiente Windows + pip sem permissão de install global). Mitigação: package é maduro (10+ anos), publicado por mantenedores conhecidos da comunidade React, ~3.5M downloads semanais, repositório ativo (último publish 2026-02-10). **Risco residual: BAIXO.** Mesmo assim, classificar como `[ASSUMED]` por rigor.

**Recomendação ao planner:** inserir um `checkpoint:human-verify` antes do `npm install react-dropzone`, apenas para confirmação visual humana. Comando de verificação:
```bash
npm view react-dropzone repository.url
npm view react-dropzone maintainers
```

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```text
                    ┌──────────────────────────────────────────────┐
                    │              CLIENTE (browser)                │
                    │                                              │
                    │  /portal/documentos                          │
                    │  ┌─────────────────────────────────────────┐ │
                    │  │ Drag-and-drop zone (react-dropzone)     │ │
                    │  │ ├─ validação extensão + size + file.type│ │
                    │  │ ├─ exibe progresso (onUploadProgress)   │ │
                    │  │ └─ lista docs + botão Download/Aprovar  │ │
                    │  └─────────────────────────────────────────┘ │
                    └───────────────────┬──────────────────────────┘
                                        │
                                        │ supabase.storage.from('cliente-docs')
                                        │   .upload(path, file, { onUploadProgress })
                                        │   .createSignedUrl(path, 3600)
                                        │
                                        ▼
                    ┌──────────────────────────────────────────────┐
                    │           SUPABASE STORAGE                    │
                    │           bucket: cliente-docs (privado)      │
                    │  storage.objects RLS:                         │
                    │    SELECT:  (foldername(name))[1] = cliente_id│
                    │    INSERT:  same path scope per role          │
                    │    DELETE:  service_role only                 │
                    └───────────────────┬──────────────────────────┘
                                        │
                                        │ (paralelo) INSERT row
                                        ▼
                    ┌──────────────────────────────────────────────┐
                    │     POSTGRES: cliente_docs                    │
                    │  (id, cliente_id, autor_*, tag, versao,       │
                    │   parent_doc_id, requer_aprovacao, status)    │
                    └───────────────────┬──────────────────────────┘
                                        │
                  ┌─────────────────────┴────────────────────┐
                  │                                          │
        TRIGGER ON UPDATE                          TRIGGER ON INSERT
        (status muda)                              (autor_tipo='cliente')
                  │                                          │
                  └─────────────────┬────────────────────────┘
                                    │ pg_net.http_post
                                    ▼
                    ┌──────────────────────────────────────────────┐
                    │      EDGE FUNCTION: notify-aprovacao-evento   │
                    │      (eventos a, b, c)                        │
                    │      carrega _shared/aprovacoes.ts            │
                    └───────────────────┬──────────────────────────┘
                                        │
                                        │ Promise.allSettled([
                                        │   sendSlack(...),
                                        │   sendEmail(supabase, ...),
                                        │   sendPush(supabase, ...)
                                        │ ])
                                        ▼
                    ┌──────────────────────────────────────────────┐
                    │     Idempotência via UNIQUE                   │
                    │     notificacoes_envios (perfil_id, tipo,     │
                    │     canal, dia, entidade_id=doc_id)           │
                    └──────────────────────────────────────────────┘

       PG_CRON (diário 10:00 UTC = 07:00 BRT)
                │
                ▼
       SELECT public.cron_disparar_aprovacoes_stale()
                │
                │ FOR docs WHERE status='pending'
                │   AND now() - sent_at > dias_para_aprovacao_pendente
                │   AND NOT EXISTS stale notif hoje
                │ LOOP
                ▼
       pg_net.http_post → notify-aprovacoes-stale → mesmo helper
```

### Recommended Project Structure (novos arquivos)

```
src/
├── components/
│   └── docs/                                    # NOVO
│       ├── DocUploadZone.tsx                    # react-dropzone wrapper
│       ├── DocList.tsx                          # lista com versões + ações
│       ├── DocVersionDropdown.tsx               # "Ver versões anteriores"
│       ├── AprovacaoButtons.tsx                 # Aprovar / Solicitar Revisão
│       ├── SolicitarRevisaoModal.tsx            # textarea comentário
│       └── BucketUsageBanner.tsx                # warning > 80% (coord+)
├── hooks/
│   ├── useClienteDocs.ts                        # NOVO — list + mutations
│   └── useAprovacoesPendentes.ts                # NOVO — dashboard query
├── pages/
│   ├── portal/
│   │   └── PortalDocumentosPage.tsx             # NOVO — /portal/documentos
│   └── AprovacoesPendentesPage.tsx              # NOVO — /portal-admin/aprovacoes-pendentes
├── lib/
│   ├── doc-validation.ts                        # NOVO — extension + size + MIME
│   └── doc-mime.ts                              # NOVO — whitelist constants
supabase/
├── functions/
│   ├── _shared/
│   │   └── aprovacoes.ts                        # NOVO — helper Phase 7
│   ├── notify-aprovacao-evento/                 # NOVO — eventos a/b/c
│   │   └── index.ts
│   └── notify-aprovacoes-stale/                 # NOVO — evento d (cron)
│       └── index.ts
└── migrations/
    ├── 037_cliente_docs.sql                     # NOVO — tabela + RLS + JSONB + trigger
    └── 038_cron_aprovacoes_stale.sql            # NOVO — pg_cron schedule
```

### Pattern 1: Storage Bucket Creation + RLS (D-04, D-14, D-15)

**What:** Bucket privado `cliente-docs` com path scheme `{cliente_id}/{doc_id}.{ext}`. RLS no `storage.objects` filtra por primeiro folder segment.

**When to use:** Toda interação com Storage neste phase passa por este pattern.

**A — Criação do bucket (fora migration sequencial — D-14):**

Opção A1 — via CLI (recomendado pelo plano):
```bash
# Bucket privado com whitelist MIME + 10MB limit aplicado no nível bucket (defense-in-depth)
supabase storage buckets create cliente-docs \
  --public false \
  --file-size-limit 10485760 \
  --allowed-mime-types "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.oasis.opendocument.text,image/jpeg,image/png,image/webp"
```

Opção A2 — via SQL Dashboard (mesma INSERT que migration 009 usou, mas `public=false`):
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cliente-docs',
  'cliente-docs',
  false,
  10485760,  -- 10 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.oasis.opendocument.text',
    'image/jpeg', 'image/png', 'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;
```

**B — RLS policies em `storage.objects` (Dashboard SQL Editor — D-15):**

Pattern mistura `storage.foldername()` (ofical: [CITED: supabase.com/docs/guides/storage/security/access-control]) com helpers role-aware do projeto (`public.is_at_least`, `public.is_interno` — verificados em migrations 021/027/035).

```sql
-- SELECT — cliente vê docs do próprio cliente_id; interno vê dos seus; coord+ vê todos
CREATE POLICY cliente_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cliente-docs' AND (
      -- cliente: pasta = seu cliente_id
      (storage.foldername(name))[1] = (
        SELECT cliente_id::text FROM perfis WHERE id = auth.uid()
      )
      OR
      -- interno: dos seus clientes
      (public.is_interno() AND (storage.foldername(name))[1] IN (
        SELECT c.id::text FROM clientes c WHERE c.responsavel_id = auth.uid()
      ))
      OR
      -- coord+
      public.is_at_least('coordenador')
    )
  );

-- INSERT — cliente sobe só na própria pasta; interno em qualquer cliente que tem RLS
CREATE POLICY cliente_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cliente-docs' AND (
      (storage.foldername(name))[1] = (
        SELECT cliente_id::text FROM perfis WHERE id = auth.uid()
      )
      OR
      (public.is_interno() AND (
        (storage.foldername(name))[1] IN (
          SELECT c.id::text FROM clientes c WHERE c.responsavel_id = auth.uid()
        )
        OR public.is_at_least('coordenador')
      ))
    )
  );

-- UPDATE — não permitido (path imutável; nova versão = novo doc_id = novo path)
-- DELETE — service_role only (edge function de auditoria)
-- Não criar policy → RLS DENY default
```

**C — Upload pattern (client-side, mirroring `usePerfis.ts:87`):**

```typescript
// src/hooks/useClienteDocs.ts (excerpt)
export function useUploadClienteDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      clienteId: string
      file: File
      tag: TagDoc
      requerAprovacao: boolean
      autorId: string
      autorTipo: AutorDoc
      parentDocId?: string | null
      onProgress?: (pct: number) => void
    }) => {
      // 1. Validação client-side (defense-in-depth — bucket config é a 2ª linha)
      validateDocOrThrow(input.file)

      // 2. INSERT row primeiro para gerar doc_id (path scheme {cliente_id}/{doc_id}.{ext})
      const ext = input.file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const { data: row, error: rowErr } = await supabase
        .from('cliente_docs')
        .insert({
          cliente_id: input.clienteId,
          autor_id: input.autorId,
          autor_tipo: input.autorTipo,
          tag: input.tag,
          nome_arquivo: input.file.name,
          mime_type: input.file.type,
          tamanho_bytes: input.file.size,
          storage_path: '', // preenchido depois do upload
          requer_aprovacao: input.requerAprovacao,
          status: input.requerAprovacao ? 'pending' : null,
          parent_doc_id: input.parentDocId ?? null,
          // versao default 1; se parent_doc_id presente, supersede via trigger ou client lookup
        })
        .select('id')
        .single()
      if (rowErr) throw rowErr

      const path = `${input.clienteId}/${row.id}.${ext}`

      // 3. Upload com onUploadProgress
      const { error: upErr } = await supabase.storage
        .from('cliente-docs')
        .upload(path, input.file, {
          contentType: input.file.type,
          upsert: false,
          // @ts-expect-error — onUploadProgress documentado mas faltando nas types em 2.99.x
          onUploadProgress: (p: { loaded: number; total: number }) => {
            input.onProgress?.((p.loaded / p.total) * 100)
          },
        })
      if (upErr) {
        // rollback row (sem path = órfã)
        await supabase.from('cliente_docs').delete().eq('id', row.id)
        throw upErr
      }

      // 4. UPDATE storage_path
      await supabase.from('cliente_docs').update({ storage_path: path }).eq('id', row.id)

      return row.id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cliente_docs'] }),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao subir documento'),
  })
}
```

**Notes:**
- INSERT row primeiro garante doc_id determinístico antes do upload. Se upload falhar, fazemos rollback da row.
- `onUploadProgress` é suportado [CITED: https://app.studyraid.com/en/read/8395/231605/uploading-files-to-supabase-storage] mas pode não estar nos types em `@supabase/supabase-js@2.99.x` — adicionar `@ts-expect-error` ou bumpar para 2.106.2.
- Path scheme `{cliente_id}/{doc_id}.{ext}` (D-04) — nome original preservado em coluna `nome_arquivo`.

### Pattern 2: Signed URL para Download (D-04)

**What:** Gerar signed URL com expiry 60min on-demand, no client.

**When to use:** Cada vez que cliente ou interno clica "Baixar" um doc.

```typescript
// src/hooks/useClienteDocs.ts
export function useDownloadDoc() {
  return useMutation({
    mutationFn: async (storagePath: string) => {
      const { data, error } = await supabase.storage
        .from('cliente-docs')
        .createSignedUrl(storagePath, 3600) // 3600s = 60min (D-04)
      if (error) throw error
      return data.signedUrl
    },
  })
}

// Uso em componente
async function handleDownload(doc: ClienteDoc) {
  const url = await downloadMut.mutateAsync(doc.storage_path)
  // <a download> trigger via DOM
  const link = document.createElement('a')
  link.href = url
  link.download = doc.nome_arquivo // preserva nome original (CITED expiry: 60min seconds)
  document.body.appendChild(link)
  link.click()
  link.remove()
}
```

[CITED: supabase.com/docs/reference/javascript/storage-from-createsignedurl] confirma `expiresIn` em segundos. Função funciona client-side com anon key + RLS (a query é proxied pelo Supabase API que valida o JWT).

### Pattern 3: Drag-and-Drop com `react-dropzone` (PORTAL-01)

**What:** Drop zone que aceita whitelist + multi-file + chama hook de upload.

```tsx
// src/components/docs/DocUploadZone.tsx
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export function DocUploadZone({
  onFiles,
  multiple = true,
  disabled = false,
}: {
  onFiles: (files: File[]) => void
  multiple?: boolean
  disabled?: boolean
}) {
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: ACCEPT,
    maxSize: MAX_SIZE,
    multiple,
    disabled,
    onDropRejected: (rejections) => {
      const first = rejections[0]?.errors[0]
      if (first?.code === 'file-too-large') {
        toast.error('Arquivo maior que 10 MB')
      } else if (first?.code === 'file-invalid-type') {
        toast.error('Tipo não permitido (use PDF, DOCX, DOC, ODT ou imagem)')
      } else {
        toast.error(first?.message ?? 'Arquivo rejeitado')
      }
    },
    onDropAccepted: (files) => onFiles(files),
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
        isDragActive && !isDragReject && 'border-primary bg-primary/5',
        isDragReject && 'border-destructive bg-destructive/5',
        !isDragActive && 'border-muted hover:border-primary/50',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <input {...getInputProps()} aria-label="Selecionar documentos" />
      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
      <p className="text-sm text-foreground">
        {isDragActive ? 'Solte para subir' : 'Arraste arquivos ou clique para selecionar'}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        PDF, DOCX, DOC, ODT, JPG, PNG, WebP — até 10 MB
      </p>
    </div>
  )
}
```

**Native-only alternative** (caso `react-dropzone` seja vetado):
```tsx
// Skeleton: contador de dragenter/dragleave para evitar flicker quando entra child
const [dragDepth, setDragDepth] = useState(0)
<div
  onDragEnter={(e) => { e.preventDefault(); setDragDepth(d => d + 1) }}
  onDragLeave={() => setDragDepth(d => d - 1)}
  onDragOver={(e) => e.preventDefault()}
  onDrop={(e) => {
    e.preventDefault()
    setDragDepth(0)
    const files = Array.from(e.dataTransfer.files)
    // ⚠️ Validação manual: extensão, file.type, file.size
    onFiles(files)
  }}
  className={cn('zone', dragDepth > 0 && 'highlight')}
>
  <input type="file" multiple accept=".pdf,.docx,.doc,.odt,.jpg,.jpeg,.png,.webp" hidden ... />
</div>
```
Tradeoff já documentado em §Alternatives Considered. Recomendação firme: `react-dropzone`.

### Pattern 4: Validação MIME / Extension / Size (D-05)

**What:** Defense-in-depth — frontend (UX) + bucket config (backend hard limit) + RLS implicit (via bucket allowed_mime_types).

```typescript
// src/lib/doc-validation.ts
export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.odt', '.jpg', '.jpeg', '.png', '.webp'] as const
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.oasis.opendocument.text',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export type DocValidationError =
  | { code: 'EXTENSION'; message: string }
  | { code: 'MIME'; message: string }
  | { code: 'SIZE'; message: string }
  | { code: 'EMPTY'; message: string }

export function validateDoc(file: File): DocValidationError | null {
  if (file.size === 0) return { code: 'EMPTY', message: 'Arquivo vazio' }
  if (file.size > MAX_SIZE_BYTES) return { code: 'SIZE', message: 'Arquivo maior que 10 MB' }

  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
    return { code: 'EXTENSION', message: `Extensão ${ext} não permitida` }
  }

  // file.type pode ser '' em alguns navegadores Linux/iOS — checagem soft (warn, não bloqueia)
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
    return { code: 'MIME', message: `MIME ${file.type} não permitido` }
  }

  return null
}

export function validateDocOrThrow(file: File): void {
  const err = validateDoc(file)
  if (err) throw new Error(err.message)
}
```

**Honest limitation:** `file.type` é reportado pelo browser e é **não-confiável para segurança** (pode ser spoofed renomeando .exe pra .pdf). Defesa real é:
- (1) extensão whitelist
- (2) `file.type` check (UX rápido)
- (3) bucket `allowed_mime_types` (servidor confere o Content-Type do request)
- (4) tamanho via bucket `file_size_limit` (servidor enforça)

MIME sniffing real (magic bytes) é deferred (CONTEXT.md).

### Pattern 5: Multi-file Upload UX

**Recomendação:** Multi-file via `react-dropzone multiple={true}`. Cada arquivo gera 1 row + 1 upload em paralelo. Progresso **per-file** (mais informativo que agregado para o caso CONSEJ — usuário sobe RG.pdf + CNH.pdf simultaneamente e quer saber qual já subiu).

```tsx
// Componente DocUploadProgressList
function UploadList({ uploads }: { uploads: Upload[] }) {
  return (
    <ul className="space-y-2">
      {uploads.map(u => (
        <li key={u.id} className="flex items-center gap-3">
          <FileText className="w-4 h-4" />
          <span className="text-sm truncate flex-1">{u.file.name}</span>
          <span className="text-xs text-muted-foreground">{u.progress.toFixed(0)}%</span>
          {u.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          {u.status === 'error' && <AlertCircle className="w-4 h-4 text-destructive" />}
          <Progress value={u.progress} className="w-24" />
        </li>
      ))}
    </ul>
  )
}
```

### Pattern 6: Versioning UI (D-02)

**Recomendação:** Mostra apenas a versão atual na lista principal + dropdown "Ver versões anteriores" que expande inline com timeline simples (timestamp + autor + status). Padrão análogo: `ActivityTimeline` (`src/components/shared/ActivityTimeline.tsx`).

```tsx
// src/components/docs/DocVersionDropdown.tsx
import { ChevronDown } from 'lucide-react'

export function DocVersionDropdown({ doc, history }: { doc: ClienteDoc; history: ClienteDoc[] }) {
  const [open, setOpen] = useState(false)
  if (history.length === 0) return null
  return (
    <div className="border-t pt-2">
      <button onClick={() => setOpen(o => !o)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
        Ver versões anteriores ({history.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground pl-4 border-l">
          {history.map(v => (
            <li key={v.id} className="flex items-center gap-2">
              <span className="font-mono">v{v.versao}</span>
              <span>{formatDate(v.created_at)}</span>
              <span className={cn(
                'px-1.5 rounded',
                v.status === 'aprovado' && 'bg-emerald-500/10 text-emerald-500',
                v.status === 'revisao_solicitada' && 'bg-amber-500/10 text-amber-500',
                v.status === 'superseded' && 'bg-muted text-muted-foreground',
              )}>{v.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Query do histórico:** SELECT WHERE `parent_doc_id IS NOT NULL AND root_id = ?` (root_id via CTE recursivo OU simpler: client-side filtra todos os docs do cliente e agrupa por `cliente_id + tag` e ordena por `versao`).

### Pattern 7: Helper `_shared/aprovacoes.ts` (D-09)

**Skeleton mirroring email.ts/push.ts:**

```typescript
// supabase/functions/_shared/aprovacoes.ts
// @ts-nocheck (URL imports + Deno.env não resolvem no TS Node)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail, generateMagicLink } from './email.ts'
import { sendPush } from './push.ts'
import { postDm } from './slack.ts'
import { findSlackUserId, loadPrefs, findPerfilNome } from './perfis.ts'

export type EventoAprovacao =
  | 'cliente_aprovou'         // (a)
  | 'cliente_pediu_revisao'   // (b)
  | 'cliente_subiu_doc'       // (c)
  | 'aprovacao_stale'         // (d) — 5+ dias sem resposta

export interface SendNotificacaoAprovacaoParams {
  perfilId: string  // consultor para a/b/c/d; ou cliente para reenviar-lembrete (D-12 helper variant)
  evento: EventoAprovacao
  docId: string
  clienteNome: string
  docNomeArquivo: string
  comentarioCliente?: string | null
  appUrl: string
  // Para D-12 reenviar-lembrete: skipSlack=true
  skipSlack?: boolean
}

export interface SendNotificacaoAprovacaoResult {
  ok: boolean
  slack: { ok: boolean; skipped?: string; error?: string }
  email: { ok: boolean; skipped?: string; status?: string; errorMsg?: string }
  push:  { ok: boolean; skipped?: string }
}

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')

function subjectFor(e: EventoAprovacao, clienteNome: string, docNome: string): string {
  switch (e) {
    case 'cliente_aprovou':       return `${clienteNome} aprovou ${docNome}`
    case 'cliente_pediu_revisao': return `${clienteNome} pediu revisão em ${docNome}`
    case 'cliente_subiu_doc':     return `${clienteNome} enviou ${docNome}`
    case 'aprovacao_stale':       return `Aprovação parada há +5 dias — ${docNome}`
  }
}

export async function sendNotificacaoAprovacao(
  supabase: SupabaseClient,
  p: SendNotificacaoAprovacaoParams,
): Promise<SendNotificacaoAprovacaoResult> {
  // 1. Carrega prefs + slack + email do destinatário
  const prefs = await loadPrefs(supabase, p.perfilId)
  const slackUserId = await findSlackUserId(supabase, p.perfilId)
  const { data: perfil } = await supabase
    .from('perfis').select('email, nome')
    .eq('id', p.perfilId).maybeSingle()

  const subject = subjectFor(p.evento, p.clienteNome, p.docNomeArquivo)
  const deepLink = `${p.appUrl}/clientes` // ajustar para deep-link de aprovação

  // 2. Decisões por canal — tipo 'documentos' (D-08)
  const wantSlack = !p.skipSlack && prefs?.documentos?.slack === true && slackUserId
  const wantEmail = prefs?.documentos?.email === true && perfil?.email
  const wantPush  = prefs?.documentos?.push === true

  // 3. Promise.allSettled
  const slackP = wantSlack
    ? postDm(SLACK_BOT_TOKEN!, slackUserId!, subject, [
        { type: 'section', text: { type: 'mrkdwn', text: `*${subject}*${p.comentarioCliente ? `\n_"${p.comentarioCliente}"_` : ''}` } },
        { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Abrir CRM' }, url: deepLink }] },
      ])
    : Promise.resolve({ ok: true, skipped: 'slack_off' })

  const emailP = wantEmail
    ? sendEmail(supabase, {
        perfilId: p.perfilId,
        toEmail: perfil!.email!,
        tipo: 'documentos' as any, // requer estender TipoNotif em email.ts/push.ts
        entidadeId: p.docId,
        entidadeTipo: null,
        subject,
        html: `<p>${subject}</p>${p.comentarioCliente ? `<blockquote>${p.comentarioCliente}</blockquote>` : ''}<p><a href="${deepLink}">Abrir CRM</a></p>`,
      })
    : Promise.resolve({ ok: true, skipped: 'email_off' })

  const pushP = wantPush
    ? sendPush(supabase, {
        perfilId: p.perfilId,
        tipo: 'documentos' as any,
        entidadeId: p.docId,
        entidadeTipo: null,
        payload: {
          title: subject.slice(0, 50),
          body: (p.comentarioCliente ?? `Abra o CRM para ver`).slice(0, 150),
          data: { deepLink, tipo: 'documentos' as any, entidadeId: p.docId },
        },
      })
    : Promise.resolve({ ok: true, skipped: 'push_off' })

  const [slackS, emailS, pushS] = await Promise.allSettled([slackP, emailP, pushP])
  const unwrap = (s: PromiseSettledResult<any>) =>
    s.status === 'fulfilled' ? s.value : { ok: false, error: String(s.reason) }

  return {
    ok: unwrap(slackS).ok && unwrap(emailS).ok && unwrap(pushS).ok,
    slack: unwrap(slackS),
    email: unwrap(emailS),
    push: unwrap(pushS),
  }
}
```

**Required edits to existing helpers:**
- `_shared/email.ts:36` — extender `TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao' | 'documentos'`
- `_shared/push.ts:43` — mesma extensão
- `_shared/perfis.ts:9-20` — adicionar `documentos: PreferenciasTipo` em `PreferenciasNotif`
- `notificacoes_envios.tipo` CHECK — `ALTER ... CHECK (tipo IN ('tarefa','cadencia','renovacao','indicacao','documentos'))` em migration 037 (mesmo pattern de 036 expandindo `canal` CHECK)

### Pattern 8: Trigger SQL para eventos a/b/c (D-10)

```sql
-- migration 037_cliente_docs.sql (excerpt)

-- Trigger function: dispara notify-aprovacao-evento via pg_net.http_post
CREATE OR REPLACE FUNCTION public.cliente_docs_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret      TEXT;
  v_url         TEXT := 'https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-aprovacao-evento';
  v_evento      TEXT;
  v_cliente     RECORD;
  v_responsavel UUID;
BEGIN
  -- Decide evento
  IF TG_OP = 'INSERT' AND NEW.autor_tipo = 'cliente' THEN
    v_evento := 'cliente_subiu_doc';  -- (c)
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'aprovado' AND OLD.status IS DISTINCT FROM 'aprovado' THEN
    v_evento := 'cliente_aprovou';  -- (a)
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'revisao_solicitada' AND OLD.status IS DISTINCT FROM 'revisao_solicitada' THEN
    v_evento := 'cliente_pediu_revisao';  -- (b)
  ELSE
    RETURN NEW;  -- não dispara para superseded/other
  END IF;

  -- Resolve consultor responsável (clientes.responsavel_id)
  SELECT responsavel_id, nome INTO v_responsavel, v_cliente
  FROM clientes WHERE id = NEW.cliente_id;

  IF v_responsavel IS NULL THEN
    RETURN NEW;  -- cliente sem responsável, skip silencioso
  END IF;

  -- Lookup secret
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'webhook_aprovacao_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'cliente_docs_after_change: secret ausente';
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP POST
  PERFORM net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
      'evento', v_evento,
      'doc_id', NEW.id,
      'cliente_id', NEW.cliente_id,
      'destinatario_perfil_id', v_responsavel,
      'comentario_cliente', NEW.comentario_cliente
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cliente_docs_after_insert
  AFTER INSERT ON cliente_docs
  FOR EACH ROW EXECUTE FUNCTION public.cliente_docs_after_change();

CREATE TRIGGER trg_cliente_docs_after_update
  AFTER UPDATE ON cliente_docs
  FOR EACH ROW EXECUTE FUNCTION public.cliente_docs_after_change();
```

**Mirror pattern de migration 031** (renovações). Idempotência garantida no helper (`sendEmail`/`sendPush` retornam `skipped_idempotent` via UNIQUE notif).

### Pattern 9: pg_cron Schedule + Edge Function (D-10 evento d)

```sql
-- migration 038_cron_aprovacoes_stale.sql

CREATE OR REPLACE FUNCTION public.cron_disparar_aprovacoes_stale()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret      TEXT;
  v_url         TEXT := 'https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-aprovacoes-stale';
  v_dias        INT;
  v_doc         RECORD;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'webhook_aprovacao_secret';
  IF v_secret IS NULL THEN RETURN; END IF;

  -- Lê threshold do JSONB configurações (D-13)
  SELECT COALESCE((c.metas->>'dias_para_aprovacao_pendente')::int, 5)  -- ajustar path se for fora de metas
    INTO v_dias
    FROM configuracoes c WHERE id = 'default';

  FOR v_doc IN
    SELECT d.id, d.cliente_id, d.nome_arquivo, c.responsavel_id, c.nome AS cliente_nome
      FROM cliente_docs d
      JOIN clientes c ON c.id = d.cliente_id
     WHERE d.status = 'pending'
       AND d.requer_aprovacao = true
       AND (now() - d.created_at) > make_interval(days => v_dias)
       AND c.responsavel_id IS NOT NULL
       -- Idempotência day-level: pula se já notificou hoje
       AND NOT EXISTS (
         SELECT 1 FROM notificacoes_envios n
         WHERE n.perfil_id = c.responsavel_id
           AND n.tipo = 'documentos'
           AND n.entidade_id = d.id
           AND n.dia = CURRENT_DATE
       )
  LOOP
    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
        'doc_id', v_doc.id,
        'cliente_id', v_doc.cliente_id,
        'destinatario_perfil_id', v_doc.responsavel_id,
        'cliente_nome', v_doc.cliente_nome,
        'doc_nome_arquivo', v_doc.nome_arquivo
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      )
    );
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'disparar-aprovacoes-stale',
  '0 11 * * *',  -- diário 11:00 UTC = 08:00 BRT (depois do resumo diário 07h)
  'SELECT public.cron_disparar_aprovacoes_stale()'
);
```

### Pattern 10: Bucket Usage Query (D-06)

**Recomendação:** **Função SQL on-demand** chamada pelo dashboard `/portal-admin`. Função soma `metadata->>'size'` em `storage.objects` filtrado por bucket_id. Para ~20 clientes × ~ centenas de arquivos = milissegundos. Não vale a complexidade de cron.

```sql
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

UI: hook `useBucketUsage()` chama RPC; banner renderiza se `bytes > 0.8 * 1_073_741_824` AND user é coord+.

```typescript
export function useBucketUsage() {
  return useQuery({
    queryKey: ['bucket_usage', 'cliente-docs'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bucket_usage_bytes', { p_bucket: 'cliente-docs' })
      if (error) throw error
      return Number(data ?? 0)
    },
    staleTime: 5 * 60 * 1000, // 5min — não muda rápido
  })
}
```

### Pattern 11: Configurações JSONB Update (D-13)

`configuracoes` é registro singleton (`id='default'`). `dias_para_aprovacao_pendente` vai no JSONB (mesma row, sem nova coluna). Backfill em migration 037:

```sql
-- Garante chave existente com default 5
UPDATE configuracoes
SET metas = jsonb_set(
  COALESCE(metas, '{}'::jsonb),
  '{dias_para_aprovacao_pendente}',
  '5'::jsonb,
  true  -- create_if_missing
)
WHERE id = 'default'
  AND (metas->>'dias_para_aprovacao_pendente') IS NULL;
```

**⚠️ Open question:** o CONTEXT.md fala de `configuracoes.dias_para_aprovacao_pendente` mas o type atual coloca metas como subobjeto. O planner precisa decidir: chave top-level no JSONB (nova coluna `dias_para_aprovacao_pendente integer` na tabela) OU dentro de `metas` JSONB existente? **Recomendação:** dentro de `metas` (não adiciona coluna nova, segue pattern Phase 1/2).

Type extension em `src/types/index.ts`:
```typescript
export interface MetasConfig {
  // ...existentes
  dias_para_aprovacao_pendente?: number  // default 5
}
```

### Pattern 12: NotificacoesPanel matriz 5×3 (D-08)

Mudança mecânica em `src/components/me/NotificacoesPanel.tsx`:

```typescript
// Linha 22-27 — adicionar entry
const TIPOS: { id: TipoNotif; label: string; descricao: string }[] = [
  { id: 'tarefa',     label: 'Tarefas',     descricao: '...' },
  { id: 'cadencia',   label: 'Cadência',    descricao: '...' },
  { id: 'renovacao',  label: 'Renovação',   descricao: '...' },
  { id: 'indicacao',  label: 'Indicação',   descricao: '...' },
  { id: 'documentos', label: 'Documentos',  descricao: 'Aprovações + uploads em propostas e contratos' },  // NOVO
]

// Linha 29-35 — adicionar entry no DEFAULT_PREFS
const DEFAULT_PREFS: PreferenciasNotif = {
  tarefa:     { slack: false, email: true, push: false },
  cadencia:   { slack: false, email: true, push: false },
  renovacao:  { slack: false, email: true, push: false },
  indicacao:  { slack: false, email: true, push: false },
  documentos: { slack: false, email: true, push: false },  // NOVO
}
```

E em `src/types/index.ts`:
```typescript
export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao' | 'documentos'

export interface PreferenciasNotif {
  tarefa:     { slack: boolean; email: boolean; push: boolean }
  cadencia:   { slack: boolean; email: boolean; push: boolean }
  renovacao:  { slack: boolean; email: boolean; push: boolean }
  indicacao:  { slack: boolean; email: boolean; push: boolean }
  documentos: { slack: boolean; email: boolean; push: boolean }
}

// Novos tipos D-16
export type AutorDoc = 'interno' | 'cliente'
export type TagDoc = 'proposta' | 'contrato' | 'relatorio' | 'outro'
export type StatusDoc = 'pending' | 'aprovado' | 'revisao_solicitada' | 'superseded' | null

export interface ClienteDoc {
  id: string
  cliente_id: string
  autor_id: string
  autor_tipo: AutorDoc
  tag: TagDoc
  nome_arquivo: string
  mime_type: string
  tamanho_bytes: number
  storage_path: string
  versao: number
  parent_doc_id: string | null
  requer_aprovacao: boolean
  status: StatusDoc
  comentario_cliente: string | null
  created_at: string
  deleted_at: string | null
}
```

`NotificacoesPanel` também precisa de backfill da matriz JSONB no migration 037 (pattern de 036 — `jsonb_set` aninhado).

### Anti-Patterns to Avoid

- **❌ Hardcode `cliente_id` no path do client sem verificar:** sempre derivar de `perfis.cliente_id` (cliente) ou validar `clientes.responsavel_id = auth.uid()` (interno) ANTES de chamar `.upload()`. RLS pega, mas erro vem como "RLS violation" feio.
- **❌ Renderizar `nome_arquivo` raw em `dangerouslySetInnerHTML`:** sempre via interpolação React (escape automático). Filename de usuário malicioso pode conter `<script>` — não importa para PDF mas importa para UI.
- **❌ Loop `for` em vez de Promise.allSettled no helper:** sequência sequencial perde latência (Slack ~300ms, Resend ~500ms, web-push ~200ms = 1s sequencial vs 500ms paralelo).
- **❌ Esquecer de criar trigger ON UPDATE/INSERT separadamente:** Postgres não permite `AFTER INSERT OR UPDATE` em mesma trigger se a lógica depende de OLD (que só existe em UPDATE). Criar 2 triggers separadas usando mesma function.
- **❌ Usar `await` no signed URL e bloquear render:** sempre `useMutation`/lazy. Signed URL é gerada on-click.
- **❌ Hardcode 60min como literal `3600` repetido:** extrair constante `SIGNED_URL_EXPIRY_SECONDS = 3600`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop com múltiplos arquivos | Counter manual de `dragenter/dragleave` + accept matching + reject UX | `react-dropzone@15.0.0` | Corner cases (iOS touch, child element re-entry, empty `dataTransfer.items` em alguns browsers) custam horas. ~20KB de bundle vale a pena. |
| Signed URL geração | Edge function proxy `get-signed-url` | `supabase.storage.from(b).createSignedUrl(p, 3600)` direto do client | Client-side já respeita RLS via JWT; edge function adiciona latency e ponto de falha sem ganho |
| Idempotência de notificações | Tabela custom + WHERE manual nos triggers | Reusa UNIQUE em `notificacoes_envios` (já em prod) | Pattern Phase 5; testado |
| Quota check para Slack/Push | Lógica de quota no helper aprovacoes | Skip (Slack não tem quota relevante; Push tampouco) | Resend é o único canal com quota e helper email.ts já cobre |
| MIME sniffing real | Edge function `validate-upload` que lê magic bytes | Extension + bucket `allowed_mime_types` config | Custo de implementação alto, ataque hipotético (cliente CONSEJ não é hostil). Defer até virar problema real. |
| Cron job em Vercel | Vercel cron + endpoint | pg_cron (já em uso Phase 5 migration 031/034) | Pattern existente, sem novo deploy target |
| Multi-device tracking | Custom session table | Reusa `push_subscriptions` (Phase 6) — push é o canal direto | `sendPush()` já faz fanout para todas as subs do perfil |
| File picker custom | `<input type="file" hidden>` + label + iconografia + estado | `react-dropzone` `getInputProps()` | Mesma razão de drag-and-drop |

**Key insight:** Phase 7 é 80% reuso + 20% código novo. O risco é re-criar algo que já existe (helper de notificação, pattern de cron, RLS role-aware). Sempre buscar a migration mais recente que faz algo similar antes de inventar.

---

## Runtime State Inventory

> Phase 7 é **majoritariamente greenfield** (nova tabela, nova rota, novo bucket). **Algumas extensões** afetam runtime state existente:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `perfis.preferencias_notif` JSONB precisa adicionar chave `documentos` em **todos os perfis existentes** (backfill) | Backfill no migration 037 com `jsonb_set` (pattern 036) |
| Stored data | `configuracoes` row `id='default'` precisa receber `dias_para_aprovacao_pendente` no JSONB metas | UPDATE no migration 037 com `jsonb_set` `create_if_missing=true` |
| Stored data | `notificacoes_envios` CHECK constraint sobre `tipo` precisa incluir `'documentos'` | DROP + ADD CONSTRAINT no migration 037 (pattern de migration 036 expandindo `canal`) |
| Stored data | `perfis.cliente_id` — **CONFIRMADO existe** desde migration 015 linha 9 (não precisa adicionar) | Nenhuma. |
| Live service config | Supabase Storage bucket `cliente-docs` precisa ser criado via CLI ou Dashboard (não vai em migration sequencial) | Manual step no plano com checkpoint |
| Live service config | `storage.objects` RLS policies aplicadas via Dashboard SQL Editor (não vai em migration) | Manual step no plano com checkpoint + SQL pronto colado |
| Live service config | Supabase Vault: secret `webhook_aprovacao_secret` (novo, p/ trigger + cron) | `SELECT vault.create_secret(...)` manual antes de deploy edge functions |
| OS-registered state | pg_cron job `disparar-aprovacoes-stale` precisa estar registrado | Migration 038 chama `cron.schedule()` — idempotente |
| OS-registered state | Edge functions `notify-aprovacao-evento` + `notify-aprovacoes-stale` precisam estar deployadas | `supabase functions deploy notify-aprovacao-evento notify-aprovacoes-stale` |
| Secrets/env vars | `webhook_aprovacao_secret` no Vault — necessário para trigger + cron chamarem edge function | Manual step no plano |
| Secrets/env vars | Reusa `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SLACK_BOT_TOKEN`, `APP_URL` (todos Phase 5/6) | Nenhuma. |
| Build artifacts | `dist/` (Vite) regenera automaticamente. Não há pacote install/instalado que carregue nome velho. | Nenhuma. |

**Nothing found in category:** OS-registered state na máquina dev (não usa Windows Task Scheduler/launchd/systemd para nada deste phase — só pg_cron no Postgres remoto).

---

## Common Pitfalls

### Pitfall 1: `onUploadProgress` ausente nos types do `@supabase/supabase-js@2.99.x`
**What goes wrong:** TypeScript erro `Property 'onUploadProgress' does not exist on type 'FileOptions'`.
**Why it happens:** Suporte foi adicionado em `@supabase/storage-js` mas pode demorar a aparecer nos types empacotados no SDK principal.
**How to avoid:** Adicionar `// @ts-expect-error` comentado com link issue OU bumpar `@supabase/supabase-js` para 2.106.2 (pequeno bump 2.99 → 2.106, semver minor — confirmar changelog).
**Warning signs:** Build TypeScript erro em `useUploadClienteDoc` na opção `onUploadProgress`.

### Pitfall 2: `file.type` vazio ou inconsistente
**What goes wrong:** Validation MIME passa string vazia ou nega arquivo legítimo no Linux/iOS.
**Why it happens:** Browser nem sempre preenche `file.type` (depende de OS file-type registry).
**How to avoid:** Tratar `file.type === ''` como "indeterminado" (permitir, deixar bucket `allowed_mime_types` enforçar).
**Warning signs:** Usuário Linux/iOS recebe "MIME não permitido" para PDF legítimo.

### Pitfall 3: Path traversal via filename injection
**What goes wrong:** Cliente upload `../../outro-cliente/secreto.pdf` e bypassa RLS.
**Why it happens:** Filename original concatenado direto no path.
**How to avoid:** **NUNCA usar `file.name` no path**. Path scheme é `{cliente_id}/{doc_id}.{ext}` onde `doc_id` é UUID gerado, `ext` é só whitelist. `file.name` vai exclusivamente em `nome_arquivo` (coluna).
**Warning signs:** Reviewer detecta `file.name` em string template do path.

### Pitfall 4: Trigger SQL `OR` em INSERT/UPDATE referencia `OLD` quebra
**What goes wrong:** `CREATE TRIGGER ... AFTER INSERT OR UPDATE ...` com lógica `OLD.status` falha em INSERT (não existe OLD).
**Why it happens:** Trigger única para 2 eventos com semântica diferente.
**How to avoid:** **2 triggers separadas** (INSERT-only e UPDATE-only) chamando mesma função, que usa `TG_OP` para discriminar.
**Warning signs:** Erro Postgres `record "old" is not assigned yet`.

### Pitfall 5: Trigger AFTER UPDATE com `pg_net.http_post` lenta segura transação
**What goes wrong:** Transação UPDATE em `cliente_docs` espera o HTTP POST retornar antes de commit.
**Why it happens:** `pg_net.http_post` por padrão é assíncrona/fire-and-forget, MAS se chamada de dentro de função SECURITY DEFINER em uma transação ativa, pode bloquear até o pg_net worker ler o request.
**How to avoid:** `pg_net.http_post` é assíncrona por design — não bloqueia commit (verificado em migration 031). Mas atenção: se houver erro de DNS/network, a notif simplesmente não dispara (sem retry no Postgres). Helper deve ser resiliente.
**Warning signs:** Latency anormal em UPDATEs de `cliente_docs.status`.

### Pitfall 6: Idempotência day-level expira notif legítima
**What goes wrong:** Cliente aprova doc às 23:50 → notif disparada. Cliente aprova OUTRO doc do mesmo consultor às 00:10 → UNIQUE `(perfil_id, tipo, dia, entidade_id)` permite (entidade_id diferente). Mas se cron stale dispara 2x no mesmo dia (rerun manual + cron), idempotência segura.
**Why it happens:** Default behavior do design. **Não é bug**, é feature. Só atenção mental.
**How to avoid:** Documentar que `entidade_id = doc_id` distingue notifs do mesmo dia para diferentes docs.

### Pitfall 7: Quota Resend estourada → docs ficam sem notif
**What goes wrong:** `sendEmail` retorna `dropped_quota` silenciosamente. Consultor não recebe email; Slack/Push continuam.
**Why it happens:** Quota free Resend (100/dia, 3000/mês). Phase 5 design é correto — só é "pitfall" se ninguém estiver verificando dashboard.
**How to avoid:** Já mitigado pelo Phase 5 (notif fallback diretor). Documentar para o time que histórico Phase 5 mostra status.

### Pitfall 8: `react-dropzone` `accept` MIME matching com `.docx`
**What goes wrong:** Cliente arrasta `arquivo.docx` mas browser reporta MIME `application/octet-stream`. Dropzone rejeita.
**Why it happens:** Windows OS pode não ter o MIME registrado.
**How to avoid:** Configurar `accept` com **extension fallback**:
```typescript
const ACCEPT = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  // listar extensão garante match mesmo se file.type errado
}
```
Padrão já no Pattern 3 acima.

### Pitfall 9: Backfill JSONB no migration 037 perde chave `push` adicionada em 036
**What goes wrong:** `jsonb_set` mal-aninhado destrói o subobjeto inteiro.
**Why it happens:** Esquecer de usar `create_if_missing=true` + cláusula WHERE.
**How to avoid:** Pattern de migration 036 linha 124-134 mostra exatamente como aninhar. Copiar literalmente:
```sql
UPDATE perfis
SET preferencias_notif = jsonb_set(
  preferencias_notif,
  '{documentos}',
  jsonb_build_object('slack', false, 'email', true, 'push', false),
  true
)
WHERE (preferencias_notif->'documentos') IS NULL;
```

---

## Code Examples

### Lookup `is_at_least` (já em prod, confiável)

```sql
-- migration 035 linha 95 — disponível desde Phase 5
SELECT public.is_at_least('coordenador');  -- bool
```

### Hook pattern análogo `useClienteDocs(clienteId)`

```typescript
// Espelha src/hooks/useClientes.ts
export function useClienteDocs(clienteId: string | null) {
  return useQuery<ClienteDoc[]>({
    queryKey: ['cliente_docs', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente_docs')
        .select('*')
        .eq('cliente_id', clienteId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useAprovarDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase
        .from('cliente_docs')
        .update({ status: 'aprovado' })
        .eq('id', docId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cliente_docs'] }),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao aprovar'),
  })
}
```

### Pattern Tab nova em `ClienteDetailPage` (PORTAL-02)

```tsx
// Localizar TabsList existente; adicionar trigger
<TabsList>
  {/* ...existentes */}
  <TabsTrigger value="docs">Documentos</TabsTrigger>
</TabsList>

<TabsContent value="docs">
  <DocsTab clienteId={cliente.id} />
</TabsContent>
```

URL state: pode adicionar `?tab=docs` via `searchParams.set('tab', 'docs')` (pattern Phase 6 D-14).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Edge function dedicada por tipo de notif | Helper compartilhado + Promise.allSettled (D-09 reuso Phase 5/6) | Phase 5 (2026-05) | Menos código duplicado; mesma lógica idempotência cross-canal |
| Bucket public + URL pública | Bucket privado + signed URL on-demand | Phase 7 (este) | Privacidade + auditoria de download (se necessário) |
| Vercel cron | pg_cron via pg_net.http_post | Phase 5 (migration 031, 034) | Sem dependência de plataforma; mesmo SQL roda em qualquer Supabase |
| Multi-step file picker manual | `react-dropzone` accept matching | — | Reduz manutenção de corner cases |

**Deprecated/outdated:**
- File `accept="..."` em `<input type="file">` apenas — funciona mas exige fallback manual para corner cases (`react-dropzone` resolve)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `react-dropzone@15.0.0` é legítimo e não tem postinstall malicioso (slopcheck não rodou) | Package Legitimacy Audit | BAIXO — package é maduro, ~10 anos, mantenedores conhecidos. Checkpoint humano antes do install mitiga. |
| A2 | `@supabase/supabase-js@2.99.x` (versão do projeto) suporta `onUploadProgress` | Pattern §Upload | MÉDIO — fix: `@ts-expect-error` ou bump para 2.106.2 |
| A3 | `dias_para_aprovacao_pendente` vai dentro de `configuracoes.metas` JSONB (vs nova coluna) | Pattern §11 | BAIXO — discutível, mas pattern Phase 1/2 (metas) sugere isto |
| A4 | Eventos a/b/c usam **2 triggers separadas** (INSERT vs UPDATE) chamando mesma function | Pattern §8 | BAIXO — pattern Postgres canônico |
| A5 | `notificacoes_envios.tipo` CHECK precisa ser DROP+ADD para incluir 'documentos' | Pattern §7 + Runtime State | NULO — pattern idêntico ao de migration 036 expandindo `canal` |
| A6 | RLS storage usa **client-side** `.createSignedUrl()` (não edge proxy) | Standard Stack Alternatives | BAIXO — Supabase docs confirma client-side respeita RLS via JWT |
| A7 | Webhook secret novo `webhook_aprovacao_secret` é necessário (não reusar webhook_renovacao_secret) | Pattern §8 | BAIXO — separação por audit boundary |

**Se a tabela estiver vazia:** N/A — há 7 ASSUMED claims que valem confirmar no /gsd-discuss-phase de follow-up se houver dúvida.

---

## Open Questions (RESOLVED)

> Resolved by planner revision iteration 2 (2026-05-28). Decisions abaixo são canônicas; planner não precisa reabrir.

1. **`dias_para_aprovacao_pendente` dentro de `metas` JSONB ou nova coluna em `configuracoes`?**
   - What we know: Phase 1/2 já têm metas como JSONB; pattern preserva schema flat
   - What's unclear: CONTEXT.md fala de "`configuracoes.dias_para_aprovacao_pendente`" — ambíguo
   - Recommendation: **JSONB `metas.dias_para_aprovacao_pendente`** (não adiciona coluna; respeita pattern existente).
   - **RESOLVED:** Chave dentro de `configuracoes.metas` JSONB (path `metas.dias_para_aprovacao_pendente`, default `5`). Migration 037 faz UPDATE com `jsonb_set(... create_if_missing=true)`. Sem nova coluna. Type extension em `MetasConfig` em `src/types/index.ts`. UI para coord+ ajustar é entregue em Plan 07-04b (componente `ConfigDiasAprovacao`).

2. **Soft delete vs hard delete em `cliente_docs.deleted_at`?**
   - What we know: CONTEXT.md diz "deferred a critério do planner"; pattern existente é soft (lixeira leads)
   - What's unclear: Se soft delete também faz DELETE no storage.objects (espaço) ou só marca row
   - Recommendation: **Soft delete na row + hard delete no storage** após confirmação. Recupera espaço sem perder histórico de aprovações. Edge function `delete-cliente-doc` (service_role) garante consistência.
   - **RESOLVED:** Soft delete na row (`deleted_at` timestamptz) + hard delete no `storage.objects` via edge function `delete-cliente-doc` rodando com `service_role`. A edge function de delete fica fora do MVP Phase 7 (deferida para gap-closure ou Phase 8). Migration 037 cria apenas a coluna `deleted_at` + RLS DELETE retorna false para usuários comuns (service_role bypassa).

3. **`storage.objects` RLS para INSERT — interno coord+ pode subir em qualquer pasta?**
   - What we know: D-15 diz "interno em qualquer pasta de cliente onde tem RLS"
   - What's unclear: Se "RLS" se refere a `cliente_docs` RLS ou `clientes` RLS
   - Recommendation: Coord+ pode subir em qualquer cliente (matches `is_at_least('coordenador')`); consultor só em clientes onde `responsavel_id = auth.uid()`. SQL no Pattern §1.
   - **RESOLVED:** Storage RLS INSERT — coord+ (`public.is_at_least('coordenador')`) pode subir em **qualquer** pasta de cliente; consultor (`public.is_interno()`) só em pastas onde `clientes.responsavel_id = auth.uid()`; cliente só na própria pasta (`(foldername(name))[1] = perfis.cliente_id::text`). SQL exato em Pattern §1.B já reflete esta resolução.

4. **Bumpar `@supabase/supabase-js` 2.99 → 2.106.2 para ter `onUploadProgress` nos types?**
   - What we know: Suporte runtime existe em 2.99.x; types catching up em 2.106.x
   - What's unclear: Risco vs benefício do bump na phase
   - **RESOLVED:** Manter `@supabase/supabase-js@2.99.x` no Phase 7 — não bumpar só pelo type. Usar `@ts-expect-error` com comentário curto no `useUploadClienteDoc` / `storage-helpers.ts` (Pitfall §1). Bump fica para milestone próprio. Reduz risk não-relacionado nesta phase.

5. **Query "uso total bucket" — função SQL on-demand ou cron diário com cache?**
   - What we know: Pattern Phase 5 tem cron; mas RPC SQL é trivial e dashboard pode chamar direto
   - What's unclear: Volume e frequência de chamadas justifica cron?
   - **RESOLVED:** Função SQL `public.bucket_usage_bytes(p_bucket TEXT)` em migration 039 (RESEARCH §10) que soma `(metadata->>'size')::bigint` em `storage.objects WHERE bucket_id = p_bucket`. SECURITY DEFINER + GRANT EXECUTE para `authenticated`. UI gate por `RequireRole atLeast='coordenador'`. Hook `useBucketUsage` com `staleTime: 5min`. Sem cron — função on-demand é suficiente para volume MVP.

6. **Reenviar lembrete (D-12) — qual `entidade_id` em `notificacoes_envios`?**
   - What we know: Idempotência day-level usa `(perfil_id, tipo, canal, dia, entidade_id)`
   - What's unclear: Se quero permitir múltiplos reenvios no mesmo dia, preciso de algo distinto no entidade_id
   - Recommendation: Reusar `entidade_id = doc_id` MAS lembretes manuais marcam `reenviado_por_id = coord_perfil_id` (a coluna existente em notificacoes_envios). UNIQUE partial index `WHERE reenviado_por_id IS NULL` permite múltiplos lembretes (já é o behavior Phase 5 reenviar).
   - **RESOLVED:** `entidade_id = doc_id` na UNIQUE de `notificacoes_envios`. Lembretes manuais coord+ usam coluna `reenviado_por_id` (já existente desde Phase 5). UNIQUE parcial `WHERE reenviado_por_id IS NULL` permite múltiplos lembretes no mesmo dia para o mesmo doc (cada manual vira nova row com `reenviado_por_id` setado). Comportamento canônico Phase 5 — sem mudança de schema.

7. **`file.type` validation: HTML5 file.type (browser-reported) suficiente para MVP ou exigir MIME sniffing real (magic bytes) no backend?**
   - What we know: file.type pode ser spoofed (Pitfall §2 e §3); bucket `allowed_mime_types` valida server-side
   - What's unclear: Necessidade de sniffing real para cliente CONSEJ não-hostil
   - **RESOLVED:** Defense-in-depth client-side via (a) HTML5 `file.type` (browser-reported, UX rápido), (b) extension whitelist, (c) `file.size` check, MAIS server-side enforcement via bucket `allowed_mime_types` + `file_size_limit` (Content-Type check no upload do Storage). MIME sniffing real (magic bytes) fica como **tech-debt aceito** (T-07-04 disposition=accept) — cliente CONSEJ não é hostil e o Storage faz a checagem real no Content-Type do request. Documentado em D-05.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite dev + tests | ✓ | 20+ (per STACK.md) | — |
| npm | install react-dropzone | ✓ | confirmado via npm view | — |
| Supabase CLI | Bucket creation, deploy edge functions | ✓ (uso Phase 5/6) | — | Dashboard manual |
| Supabase Vault | `webhook_aprovacao_secret` | ✓ (uso Phase 5 migration 031) | — | — |
| pg_cron extension | Cron schedule stale | ✓ (já habilitado migration 031) | — | — |
| pg_net extension | Trigger HTTP POST | ✓ (já habilitado migration 031) | — | — |
| Resend account | `sendEmail` helper | ✓ (Phase 5 setup) | RESEND_API_KEY no Supabase Secrets | quota dropped notification |
| VAPID keys | `sendPush` helper | ✓ (Phase 6 setup) | VAPID_PUBLIC_KEY/PRIVATE_KEY | — |
| Slack bot token | `postDm` helper | ✓ (Phase 5) | SLACK_BOT_TOKEN | helper retorna skip silencioso |

**Missing dependencies with no fallback:** Nenhuma.
**Missing dependencies with fallback:** Nenhuma.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x + Testing Library + jsdom + Playwright 1.60.x [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (unit/integration); `playwright.config.ts` (E2E) |
| Quick run command | `npm run test -- --run src/lib/__tests__/doc-validation.test.ts` |
| Full suite command | `npm run test && npm run test:rls && npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORTAL-01 | Drag-drop upload zone aceita whitelist + tamanho | unit | `npm run test -- src/components/docs/__tests__/DocUploadZone.test.tsx` | ❌ Wave 0 |
| PORTAL-01 | `validateDoc()` reject extensão/size/MIME corretamente | unit | `npm run test -- src/lib/__tests__/doc-validation.test.ts` | ❌ Wave 0 |
| PORTAL-01 | `useUploadClienteDoc` faz INSERT → upload → UPDATE storage_path; rollback on error | integration | `npm run test -- src/hooks/__tests__/useClienteDocs.test.tsx` | ❌ Wave 0 |
| PORTAL-01 | Cliente vê só docs do próprio `cliente_id` no SELECT | RLS regression | `npm run test:rls -- tests/rls/cliente_docs.test.ts` | ❌ Wave 0 |
| PORTAL-01 | Cliente NÃO pode INSERT em pasta de outro cliente_id | RLS regression | mesmo arquivo | ❌ Wave 0 |
| PORTAL-01 | E2E: cliente login → drop file → vê na lista | e2e | `npm run test:e2e -- tests/e2e/portal-docs.spec.ts` | ❌ Wave 0 |
| PORTAL-02 | Tab "Documentos" em `/clientes/:id` renderiza para interno | unit (component) | `npm run test -- src/pages/__tests__/ClienteDetailPage.test.tsx` | ❌ Wave 0 |
| PORTAL-02 | Consultor vê só docs dos clientes onde `responsavel_id = auth.uid()` | RLS regression | `tests/rls/cliente_docs.test.ts` | ❌ Wave 0 |
| PORTAL-02 | Coord+ vê todos docs | RLS regression | mesmo | ❌ Wave 0 |
| PORTAL-03 | Botões "Aprovar" / "Solicitar Revisão" UPDATE status corretamente | integration | `useClienteDocs.test.tsx` | ❌ Wave 0 |
| PORTAL-03 | Helper `sendNotificacaoAprovacao` chama 3 canais em paralelo (Promise.allSettled) | unit (helper) | `npm run test -- supabase/functions/_shared/__tests__/aprovacoes.test.ts` | ❌ Wave 0 |
| PORTAL-03 | Trigger SQL dispara HTTP POST com payload correto | manual (DB) | Verificar via SELECT em `notificacoes_envios` após UPDATE manual | manual-only — testar em staging |
| PORTAL-03 | Idempotência via UNIQUE `notificacoes_envios` evita duplicate notif | integration | `aprovacoes.test.ts` mocking insert 23505 | ❌ Wave 0 |
| PORTAL-04 | Dashboard query retorna docs pendentes > N dias respeitando RLS role-aware | integration | `npm run test -- src/hooks/__tests__/useAprovacoesPendentes.test.tsx` | ❌ Wave 0 |
| PORTAL-04 | Botão "Reenviar lembrete" cooldown 1h visual funciona | unit (component) | `npm run test -- src/components/__tests__/ReenviarLembreteButton.test.tsx` | ❌ Wave 0 |
| PORTAL-04 | Cron SQL function `cron_disparar_aprovacoes_stale` filtra corretamente | manual (SQL) | Inserir doc fixture com `created_at` antigo, executar function, verificar HTTP POST | manual-only — testar em staging |
| Cross | Matriz 5×3 em NotificacoesPanel renderiza linha `documentos` | unit (component) | `npm run test -- src/components/me/__tests__/NotificacoesPanel.test.tsx` | ❌ Wave 0 (existe arquivo?) |
| Cross | `useBucketUsage` retorna bytes corretamente; banner aparece > 80% | integration | `npm run test -- src/components/__tests__/BucketUsageBanner.test.tsx` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test -- --run --changed` (apenas testes modificados)
- **Per wave merge:** `npm run test && npm run test:rls`
- **Phase gate:** Full suite + E2E + manual staging tests verde antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/lib/__tests__/doc-validation.test.ts` — covers PORTAL-01 validation
- [ ] `src/components/docs/__tests__/DocUploadZone.test.tsx` — covers PORTAL-01 drop UX
- [ ] `src/hooks/__tests__/useClienteDocs.test.tsx` — covers PORTAL-01/02/03 mutations
- [ ] `src/hooks/__tests__/useAprovacoesPendentes.test.tsx` — covers PORTAL-04 query
- [ ] `src/components/me/__tests__/NotificacoesPanel.test.tsx` — verificar se existe (provavelmente sim, Phase 5/6)
- [ ] `src/components/__tests__/BucketUsageBanner.test.tsx` — covers D-06
- [ ] `src/components/__tests__/ReenviarLembreteButton.test.tsx` — covers D-12 cooldown
- [ ] `supabase/functions/_shared/__tests__/aprovacoes.test.ts` — covers helper Promise.allSettled paths
- [ ] `tests/rls/cliente_docs.test.ts` — covers RLS cliente/consultor/coord+
- [ ] `tests/e2e/portal-docs.spec.ts` — covers PORTAL-01 cliente flow + aprovação
- [ ] **Possível extension de mock helpers**: `src/test/supabase-mock.ts` precisa simular `storage.from().upload()` e `.createSignedUrl()` se ainda não tem

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth (já em uso); magic link para cliente; JWT validation pelo Supabase API |
| V3 Session Management | yes | JWT do Supabase Auth; logout via `supabase.auth.signOut()`; signed URLs com expiry 60min |
| V4 Access Control | yes | RLS policies em `cliente_docs` + `storage.objects` (Pattern §1); RPCs SECURITY DEFINER para operações privilegiadas |
| V5 Input Validation | yes | `validateDoc()` (Pattern §4); zod schemas em forms; bucket `allowed_mime_types` + `file_size_limit` server-side enforce |
| V6 Cryptography | yes (indireta) | JWT signing via Supabase (HMAC); signed URLs HMAC-SHA256 pelo Supabase Storage; nunca hand-rolled crypto |
| V7 Errors & Logging | yes | `notificacoes_envios.error_msg` redacted (sem secrets) — pattern Phase 5; toast errors mostram mensagem amigável, não stack |
| V8 Data Protection | yes | Bucket privado; signed URL 60min; soft delete preserva `deleted_at`; RLS impede leak cross-cliente |
| V9 Communication | yes | HTTPS (Vercel + Supabase); `pg_net.http_post` para edge function via HTTPS |
| V10 Malicious Code | partial | Whitelist MIME bloqueia executáveis; MIME sniffing real deferred — risco residual aceito |
| V13 API & Web Service | yes | Edge functions com Bearer auth (`webhook_aprovacao_secret`); pattern Phase 5 |

### Known Threat Patterns for stack Phase 7

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **T-07-01** Path traversal via filename | Tampering | Path scheme `{cliente_id}/{doc_id}.{ext}` ignora `file.name`; ext sanitized via whitelist |
| **T-07-02** Cliente sobe arquivo de outro cliente via path manipulation | Spoofing | Storage RLS WITH CHECK valida `(foldername(name))[1] = perfis.cliente_id` |
| **T-07-03** XSS via filename rendered in UI | Tampering | React escape automático em interpolação `{doc.nome_arquivo}`; nunca `dangerouslySetInnerHTML` |
| **T-07-04** File type spoofing (PDF é executável renomeado) | Tampering | Whitelist extensão + `file.type` (UX) + bucket `allowed_mime_types` (enforce). Cliente CONSEJ não é hostil; sniffing real deferred |
| **T-07-05** Quota exhaustion attack (cliente sobe 1000 arquivos) | DoS | Banner > 80% para coord+ (D-06); rate-limit via Supabase Storage built-in; sem cap per-cliente OK p/ MVP |
| **T-07-06** Signed URL leak (compartilhada externamente) | Information Disclosure | Expiry 60min; URL não inclui auth do user (independent); audit log via `notificacoes_envios` se download for trackado |
| **T-07-07** Race condition em upload concurrent mesmo doc_id | Tampering | UUID v4 colision-free; INSERT row PRIMARY KEY catch duplicate |
| **T-07-08** Enumeration de storage paths via list API | Information Disclosure | Storage list API respeita RLS SELECT policy — só vê dos seus |
| **T-07-09** Unauthorized approval mutation | Elevation of Privilege | RLS UPDATE policy WITH CHECK em `cliente_docs.status` valida `cliente_id = perfis.cliente_id` (cliente) OU `responsavel_id = auth.uid()` (interno) — apenas dono pode mudar status. Cliente NÃO pode mudar status para 'superseded' (CHECK no status novo) |
| **T-07-10** Trigger SQL injection via comentario_cliente | Injection | Trigger usa parametrized JSONB build (`jsonb_build_object`), não concat string — Postgres safe |
| **T-07-11** Webhook secret leak via logs | Information Disclosure | `_shared/aprovacoes.ts` segue pattern Phase 5 — nunca loga Authorization header |
| **T-07-12** Reenviar lembrete spam attack | DoS | Cooldown visual 1h (D-12); backend não enforça MVP mas pattern aceitável dado coord+ é trusted |

---

## Project Constraints (from CLAUDE.md)

Extraído do `./CLAUDE.md` global + `consej-crm-v2/CLAUDE.md` projeto:

- **RTK obrigatório:** prefixar comandos shell com `rtk` (ex.: `rtk npm install react-dropzone`). Filter pass-through é seguro mesmo quando RTK não tem filter.
- **PT-BR para usuário final:** toasts, mensagens de erro, labels. Inglês para código (variáveis, commits).
- **`npm` (não bun)** — confirma no `package.json` + `.npmrc`.
- **shadcn/ui + Radix** padrão para primitives — wrappers em `src/components/ui/`.
- **TanStack Query v5** para server state — sem Redux/Zustand.
- **react-hook-form + zod** para forms.
- **Nunca commitar `.env`, credenciais, chaves API.**
- **Nunca ler `package-lock.json` com Read** (~92k tokens) — usar Glob/Grep.
- **Edit preferido sobre Write** para arquivos existentes.
- **Glob/Grep/Read preferido** sobre comandos bash equivalentes.
- **Tipos centralizados em `src/types/index.ts`** — não duplicar.
- **Migrations sequenciais imutáveis** — 037 e 038 são as novas, não editar migrations antigas.

---

## Sources

### Primary (HIGH confidence)

- **Codebase Phase 5/6** (próprio repo): `supabase/functions/_shared/email.ts`, `_shared/push.ts`, `_shared/perfis.ts`, `notify-resumo-diario/index.ts`, `supabase/migrations/031_cron_renovacoes.sql`, `035_notificacoes_envios.sql`, `036_push_subscriptions.sql`, `009_storage_avatars.sql`, `015_portal_tokens.sql`, `src/hooks/usePerfis.ts`, `src/components/me/NotificacoesPanel.tsx`, `src/types/index.ts`, `src/router.tsx`, `src/pages/portal/PortalLayout.tsx` — todos lidos diretamente nesta research.
- **Supabase Storage Access Control:** https://supabase.com/docs/guides/storage/security/access-control — confirma `storage.foldername()` syntax e exemplo de private bucket per-user folder isolation.
- **Supabase Storage createSignedUrl:** https://supabase.com/docs/reference/javascript/storage-from-createsignedurl — confirma `expiresIn` em segundos.

### Secondary (MEDIUM confidence)

- **Supabase Storage onUploadProgress:** https://app.studyraid.com/en/read/8395/231605/uploading-files-to-supabase-storage — terceiro-party tutorial mostra signature `onUploadProgress(progress) => {}`. Cross-verified via GitHub issue supabase/storage#23 (apontado nos search results).
- **react-dropzone npm:** https://www.npmjs.com/package/react-dropzone — verificado via `npm view react-dropzone version` → 15.0.0 publicado 2026-02-10.

### Tertiary (LOW confidence)

- **slopcheck não executado** — `react-dropzone` classificado [ASSUMED] mas baixo risco residual (10+ anos, ~3.5M downloads/sem, mantenedores conhecidos).

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todas as libs verificadas via codebase ou npm view
- Architecture: HIGH — patterns são reuso direto Phase 5/6
- Pitfalls: HIGH (8 de 9 vêm de codebase próprio); MEDIUM em #2 (file.type quirks — documentado em MDN)
- Security: HIGH — ASVS mapping segue Phase 5/6 (security_enforcement já ativo)

**Research date:** 2026-05-28
**Valid until:** 2026-06-28 (1 mês — Supabase Storage APIs estáveis; react-dropzone estável)

## RESEARCH COMPLETE

**Phase:** 7 - Client Portal Expansion
**Confidence:** HIGH

### Key Findings

- **Bucket privado + storage.objects RLS via `(storage.foldername(name))[1] = perfis.cliente_id::text`** — pattern oficial Supabase confirma, `perfis.cliente_id` já existe (migration 015), helpers `is_at_least` / `is_interno` já em prod (migrations 021/027/035). Tudo via reuso.
- **`react-dropzone@15.0.0`** é a recomendação para drag-and-drop (publicado 2026-02-10, 10+ anos, baixo risco) — peer dep React 18 não bloqueia porque `.npmrc` já tem `legacy-peer-deps=true`.
- **Helper `_shared/aprovacoes.ts` é mecânico** — copia estrutura de `_shared/email.ts` + `_shared/push.ts` com Promise.allSettled. Precisa estender `TipoNotif` em 3 arquivos compartilhados.
- **Triggers SQL + pg_cron já têm pattern canônico** — migrations 031/034 mostram exatamente como invocar edge function via `pg_net.http_post` com Vault secret. Pitfall: 2 triggers separadas (INSERT vs UPDATE) chamando mesma função.
- **`onUploadProgress` é suportado** mas types em `@supabase/supabase-js@2.99.x` podem não refletir — `@ts-expect-error` ou bump para 2.106.2 resolve.

### File Created

`.planning/phases/07-client-portal-expansion/07-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Libs verificadas via npm view + codebase |
| Architecture | HIGH | 80% reuso de patterns Phase 5/6 |
| Pitfalls | HIGH | 8 de 9 vêm do próprio codebase |
| Security | HIGH | ASVS mapping segue Phase 5/6 |
| Validation | HIGH | Wave 0 gaps explícitos |

### Open Questions for Planner

1. `dias_para_aprovacao_pendente` dentro de `configuracoes.metas` JSONB ou nova coluna? → recomendação JSONB
2. Soft delete + hard storage delete na mesma operação? → recomendação sim, via edge function service_role
3. Coord+ pode INSERT em qualquer pasta no storage RLS? → recomendação sim (mesma lógica de `cliente_docs` RLS)
4. Bumpar `@supabase/supabase-js` 2.99 → 2.106.2 para ter onUploadProgress nos types? → planner decide (bump pequeno, risk minimo)
5. Reenviar lembrete D-12 — `entidade_id = doc_id` + `reenviado_por_id` set funciona com UNIQUE partial?
6. Sender domain Resend herda Phase 5? → recomendação sim
7. Trigger UPDATE com `OLD.status IS DISTINCT FROM NEW.status` mandatório? → recomendação sim (idempotência safety)

### Ready for Planning

Research complete. Todas as 16 decisões locked do CONTEXT.md têm pattern concreto documentado com SQL/TS/TSX. Wave 0 gaps explícitos para 10 arquivos de teste. Manual steps (bucket creation, RLS via Dashboard, Vault secret) destacados. Planner pode criar PLAN.md sem novas perguntas técnicas.

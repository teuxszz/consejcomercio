---
phase: 07-client-portal-expansion
slug: 07-security
status: verified
asvs_level: 1
block_on: high
threats_total: 18
threats_closed: 17
threats_open: 0
threats_accepted: 1
audit_date: 2026-05-29
auditor: gsd-secure-phase (Claude Opus 4.7)
register_authored_at_plan_time: true
---

# Phase 7 — Client Portal Expansion · Security Audit

Verificação de mitigação por disposição declarada nos `<threat_model>` blocks dos 6 PLAN.md (01a, 01b, 02, 03, 04a, 04b). Implementação tratada como read-only — nada foi alterado, apenas evidência foi coletada.

## Resumo

- **18 threats declaradas** entre os 6 PLAN files (T-07-01..T-07-15, com sub-IDs)
- **17 CLOSED** com evidência em arquivos reais
- **1 ACCEPTED** (T-07-04 — MIME spoofing — documentado e aceito por D-05 + RESEARCH Open Q7)
- **0 OPEN** — todas as mitigações declaradas em `mitigate` foram encontradas no código
- **0 unregistered flags** — nenhum SUMMARY.md declarou novo attack surface não-mapeado

## Threat Verification Table

| Threat ID | Categoria | Componente | Disposição | Status | Evidência (path · linhas) |
|-----------|-----------|-----------|------------|--------|---------------------------|
| T-07-01 | Tampering · path | Storage path scheme `{cliente_id}/{doc_id}.ext` | mitigate | CLOSED | `src/lib/storage-helpers.ts:21-31` (`buildDocPath`) + `src/hooks/useClienteDocs.ts:78-100` (pre-INSERT gera doc_id server-side antes do upload). `file.name` vai exclusivamente em `cliente_docs.nome_arquivo` — nunca no path. |
| T-07-02 | Spoofing · path traversal | `storage.objects` RLS bucket cliente-docs | mitigate | CLOSED | `C:\Users\Gabriel\Documents\consej-secrets\phase-7-bucket-rls-vault.sql:38-69` (políticas `cliente_docs_select` + `cliente_docs_insert` com `storage.foldername(name)[1] = cliente_id`). Aplicadas em prod (SUMMARY 07-01a confirma `polname` em `pg_policy`). |
| T-07-03 | Tampering · XSS | filename na UI | mitigate | CLOSED | `src/components/clientes/ClienteDocsList.tsx:167,232,259,307` — `{nome_arquivo}` interpolado via JSX (escape automático React). `grep dangerouslySetInnerHTML` na pasta `src/components/clientes` = 0 ocorrências. |
| T-07-04 | Tampering · MIME spoof | file.type pode mentir | accept | ACCEPTED | `src/lib/file-validation.ts:1-14` documenta tech-debt aceito (D-05 + RESEARCH Open Q7). Defesa em profundidade: bucket `allowed_mime_types` whitelist (`phase-7-bucket-rls-vault.sql:20-29`) + extensão whitelist em `file-validation.ts:16-25`. Ver § Accepted Risks abaixo. |
| T-07-05 | DoS · quota bucket | file_size_limit 10MB hard cap | mitigate | CLOSED | `phase-7-bucket-rls-vault.sql:20` (`file_size_limit=10485760`) + `supabase/migrations/037_cliente_docs.sql:40` (`CHECK tamanho_bytes <= 10485760`) + `src/lib/file-validation.ts:38` (`MAX_SIZE_BYTES`). Defesa tripla. |
| T-07-06 | Information Disclosure · signed URL leak | URL com 60min de validade | mitigate | CLOSED | `src/lib/storage-helpers.ts:16` (`SIGNED_URL_EXPIRY_SECONDS = 3600`) + `src/lib/storage-helpers.ts:62-72` (URL gerada on-click via `getSignedDownloadUrl`, consumida em `useDownloadDoc` — não em `useEffect`). |
| T-07-07 | Tampering · race condition concurrent uploads | doc_id server-generated UUID | mitigate | CLOSED | `supabase/migrations/037_cliente_docs.sql:33` (`id uuid PRIMARY KEY DEFAULT gen_random_uuid()`) + `src/hooks/useClienteDocs.ts:78-100` (INSERT pre-upload gera doc_id antes do path). Colisão impossível por PK; path imutável por `upsert:false` (`storage-helpers.ts:53`). |
| T-07-08 | Information Disclosure · storage enumeration | RLS SELECT filtra foldername | mitigate | CLOSED | `phase-7-bucket-rls-vault.sql:38-51` (`cliente_docs_select` USING `storage.foldername(name)[1] = cliente_id`). Cliente A não vê pasta de cliente B via `storage.objects.list`. |
| T-07-09 | Elevation · cliente UPDATE status | RLS WITH CHECK em `cliente_docs_update` | mitigate | CLOSED | `supabase/migrations/037_cliente_docs.sql:110-139` (`WITH CHECK` força `autor_tipo='interno' AND requer_aprovacao=true AND status IN ('aprovado','revisao_solicitada') AND cliente_id = perfis.cliente_id`). UI mirror em `src/components/clientes/AprovacaoButtons.tsx:28-35` (gate D-01). |
| T-07-09b | Elevation · UPDATE comentario_cliente | mesma policy + zod min(5) | mitigate | CLOSED | RLS `037_cliente_docs.sql:122-129` + `src/components/clientes/SolicitarRevisaoModal.tsx` (zod `z.string().min(5)`). |
| T-07-09c | Elevation · cliente UPDATE status='superseded' | RLS rejeita; só consultor via fluxo controlado | mitigate | CLOSED | `037_cliente_docs.sql:122-129` (cliente só pode setar `aprovado`/`revisao_solicitada`). `superseded` só é setado por `useUploadClienteDoc` em fluxo de versionamento controlado (`useClienteDocs.ts` D-02 mutation). |
| T-07-10 | Injection · trigger SQL via comentario_cliente | jsonb_build_object parametrizado | mitigate | CLOSED | `supabase/migrations/038_cron_aprovacoes_stale.sql:90-103` — `jsonb_build_object('comentario_cliente', NEW.comentario_cliente)`. Postgres parametriza automaticamente; sem concat de string. |
| T-07-11 | Information Disclosure · webhook secret em logs | comentário no helper + pattern email.ts | mitigate | CLOSED | `supabase/functions/_shared/aprovacoes.ts:24-25` ("WEBHOOK_APROVACAO_SECRET nunca aparece em error_msg ou logs — espelhando email.ts:18 RESEND_API_KEY rule"). |
| T-07-12 | Information Disclosure · Vault secret cleartext em trigger | `vault.decrypted_secrets` lookup | mitigate | CLOSED | `supabase/migrations/038_cron_aprovacoes_stale.sql:77-85` e `147-155` — `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='webhook_aprovacao_secret'`. Vault entry confirmado por SUMMARY 07-01a + `phase-7-bucket-rls-vault.sql:75-82`. |
| T-07-12b | DoS/Spam · reenviar lembrete rajada | cooldown 1h client-side | mitigate | CLOSED | `src/components/portal-admin/ReenviarLembreteButton.tsx:21-72` (`COOLDOWN_MS = 60*60*1000`, localStorage timestamp + disabled state). Backend não enforça MVP (coord+ é trusted role per threat_model). |
| T-07-13 | Tampering · trigger fire em status='superseded' | CASE explícito ignora superseded | mitigate | CLOSED | `supabase/migrations/038_cron_aprovacoes_stale.sql:49-64` — trigger só dispara em INSERT `autor_tipo='cliente'` ou UPDATE para `aprovado`/`revisao_solicitada`. `superseded` cai no `RETURN NEW` sem POST. |
| T-07-13 (alt) | Information Disclosure · banner uso bucket vaza | RequireRole atLeast='coordenador' | mitigate | CLOSED | `src/pages/portal-admin/AprovacoesPendentesPage.tsx:28-30` envolve `<BucketUsageBanner />` com `<RequireRole atLeast="coordenador" fallback={null}>`. Banner por si só tem comentário (`BucketUsageBanner.tsx:7-10`) exigindo gate pelo caller. RPC `bucket_usage_bytes` retorna apenas agregado bigint (sem nomes/paths) — `migrations/039_bucket_usage_function.sql:1-30`. |
| T-07-14 | Tampering · SubirNovaVersaoButton vaza para usuário errado | gate UI + RLS | mitigate | CLOSED | `src/components/clientes/SubirNovaVersaoButton.tsx:33-37` (gate `autor_tipo='interno' && status='revisao_solicitada' && (isAutor \|\| isCoordOrAbove)`). RLS INSERT/UPDATE em `037:83-104` e `110-139` é 2ª linha de defesa. |
| T-07-15 | Elevation · consultor ajusta dias_para_aprovacao_pendente | RequireRole coord+ wrapper | mitigate | CLOSED | `src/components/configuracoes/ConfigDiasAprovacao.tsx:52-76` — JSX retorna `<RequireRole atLeast="coordenador" fallback={null}>` envolvendo o input + Save. RLS de `configuracoes` já restringe writes (Phase 1 baseline). |

### Disposição Phase 6 herdada

| Threat ID | Categoria | Componente | Disposição | Status | Evidência |
|-----------|-----------|-----------|------------|--------|-----------|
| T-07-13 (Phase 6 D-03 carryover) | Persistência de subscription pós-logout / aprovação em sessão stale | Phase 6 inherited | accept | INHERITED | Phase 6 D-03 documentou que push subscriptions persistem por design (revogação acontece no service worker). Phase 7 herda sem mitigação adicional necessária. Ver `07-CONTEXT.md` D-03 (Phase 6) referência. |

## Accepted Risks

### T-07-04 — MIME type spoofing (file.type lies)

- **Categoria:** Tampering · client-supplied metadata
- **Razão de aceitar (per D-05 + RESEARCH Open Q7 RESOLVED):**
  1. Cliente CONSEJ não é hostil (empresa júnior; clientes são juridicamente conhecidos)
  2. Defesa em profundidade já presente: bucket `allowed_mime_types` filtra na borda Supabase (lado servidor) — `phase-7-bucket-rls-vault.sql:20-29`
  3. Extensão whitelist no client (`file-validation.ts:16-25`) bloqueia .exe/.sh/.bat antes de chegar no bucket
  4. Backend MIME sniffing real (e.g. `file` command Unix / libmagic) seria implementação Edge Function + ferramenta nativa — tech-debt explicitamente aceito
- **Mitigação compensatória:** se um atacante renomear `malware.exe` para `proposta.pdf` e o file.type passar como `application/pdf` falso, o bucket aceita (já que tem application/pdf na whitelist e a extensão é .pdf). O dano potencial é limitado: arquivo continua sendo armazenado no bucket privado, requer signed URL para download, e o download dispara o handler nativo do browser (que pode detectar mismatch via Content-Type vs magic bytes — fora do escopo CONSEJ MVP)
- **Tech-debt registrado:** Phase 8+ pode adicionar Edge Function de sniffing pós-upload se ameaça mudar de contorno

## Unregistered Flags

Nenhum. Nenhum SUMMARY.md (01a, 01b, 02, 03, 04a, 04b) declarou novo attack surface (`## Threat Flags` sections estão todos vazios ou mapeiam para T-07-* IDs existentes). Os SUMMARYs explicitamente afirmam: "Nenhuma nova surface fora do threat model documentado" (07-03-SUMMARY:241, 07-01b-SUMMARY:194).

## Audit Trail

- **Arquivos lidos para verificação:**
  - 6 PLANs · `.planning/phases/07-client-portal-expansion/07-{01a,01b,02,03,04a,04b}-PLAN.md`
  - 6 SUMMARYs · `.planning/phases/07-client-portal-expansion/07-{01a,01b,02,03,04a,04b}-SUMMARY.md`
  - Migrações · `supabase/migrations/037_cliente_docs.sql`, `038_cron_aprovacoes_stale.sql`, `039_bucket_usage_function.sql`
  - Out-of-repo · `C:\Users\Gabriel\Documents\consej-secrets\phase-7-bucket-rls-vault.sql`
  - Edge functions · `supabase/functions/_shared/aprovacoes.ts`, `supabase/functions/notify-aprovacao-evento/index.ts`, `supabase/functions/notify-aprovacoes-stale/index.ts`
  - Frontend libs · `src/lib/storage-helpers.ts`, `src/lib/file-validation.ts`
  - Hooks · `src/hooks/useClienteDocs.ts`
  - Componentes · `src/components/clientes/{AprovacaoButtons,SubirNovaVersaoButton,ClienteDocsList}.tsx`, `src/components/portal-admin/{BucketUsageBanner,ReenviarLembreteButton}.tsx`, `src/components/configuracoes/ConfigDiasAprovacao.tsx`
  - Pages · `src/pages/portal-admin/AprovacoesPendentesPage.tsx`
  - Tests · `tests/rls/cliente_docs.test.ts`, `tests/rls/cliente_docs_storage.test.ts` (existência + assertion count > 10 em cada)
- **Implementação NÃO modificada.** Audit puramente read-only.
- **Threats apuradas por disposição:**
  - `mitigate` → grep do padrão de mitigação nos arquivos citados no `mitigation plan`
  - `accept` → documentação inline no código + entry abaixo de `## Accepted Risks`
  - `transfer` → N/A (Phase 7 não tem threats com disposição `transfer`)
- **block_on: high · resultado:** SECURED. Nenhum threat HIGH/MEDIUM aberto.

## Próximo passo

Phase 7 está com fundação de segurança verificada. Próximo:
- Executar `/gsd-end-phase 07` para fechar oficialmente.
- UAT manual 8 itens (07-04b Task 4b-6) ainda deferido — não bloqueia close por estar relacionado a verificação de funcionalidade (delivery email/push, drag-drop iOS Safari), não a mitigação de threat.

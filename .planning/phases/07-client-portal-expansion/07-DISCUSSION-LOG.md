# Phase 7: Client Portal Expansion - Discussion Log

> **Audit trail only.** Decisões em CONTEXT.md.

**Date:** 2026-05-28
**Phase:** 07-client-portal-expansion
**Areas discussed:** Approval flow + versionamento, Storage policy, Notification triggers, Aprovações pendentes dashboard

---

## Approval flow scope

| Option | Description | Selected |
|---|---|---|
| Só proposta | Botões só em tag='proposta'. Outros = read-only | |
| Proposta + contrato | Contrato também precisa aprovação simbólica | |
| Todos os 4 tipos | Cliente aprova qualquer doc | |
| Configurável por upload | Consultor marca "Pedir aprovação" no upload | ✓ |

**Notes:** Reinterpretação de PORTAL-03 documentada em CONTEXT D-01. Tags viram rótulo informativo, não gate de fluxo.

---

## Versioning

| Option | Description | Selected |
|---|---|---|
| Histórico de versões | v1 + v2 ambos visíveis. Schema com `versao` + `parent_doc_id` | ✓ |
| v2 substitui v1 (replace) | Soft delete v1, v2 ativa | |
| Histórico mas v1 read-only | Soft-deprecate | |

**Notes:** Audit-friendly. Status `superseded` em v1 quando v2 chega. UI badge "v2 (atual)" + dropdown "Ver versões anteriores".

---

## Upload by client

| Option | Description | Selected |
|---|---|---|
| Cliente sobe + consultor sobe (Recomendado) | Bidirecional; uploads do cliente nunca recebem botões de aprovação | ✓ |
| Só consultor sobe | Cliente envia por WhatsApp/email | |
| Cliente limitado a tag 'outro' | Tags proposta/contrato/relatório só consultor | |

**Notes:** Elimina retrabalho WhatsApp manual (REQUIREMENTS-01). `cliente_docs.autor_tipo` text CHECK IN ('interno','cliente').

---

## Storage path scheme

| Option | Description | Selected |
|---|---|---|
| `{cliente_id}/{doc_id}.{ext}` (Recomendado) | doc_id = uuid; filename original guardado no DB; random uuid evita collision + não vaza nome na URL | ✓ |
| `{cliente_id}/{tag}/{filename}` | Subpastas por tag; original filename preservado | |
| `{cliente_id}/{yyyy-mm}/{uuid}_{filename}` | Organização por mês + uuid prefix | |

**Notes:** Download via signed URL (60min expiry). Path mínimo + DB para metadata.

---

## MIME whitelist + max size

| Option | Description | Selected |
|---|---|---|
| PDF + DOCX + imgs até 10MB | Cobre 95% casos jurídicos | |
| PDF + DOCX + imgs + planilhas até 25MB | Adiciona xlsx/csv | |
| Qualquer formato até 50MB | Supabase max hard cap | |
| Whitelist específica + 10MB (Recomendado) | pdf, docx, doc, odt, jpg, jpeg, png, webp | ✓ |

**Notes:** Validate frontend (input accept + size) + backend (RLS policy de size + MIME sniffing tech-debt).

---

## Quota total

| Option | Description | Selected |
|---|---|---|
| Sem limite per-cliente, monitora total (Recomendado) | Card no /portal-admin (X MB / 1024 MB); banner >80% para coord+ | ✓ |
| Hard cap 50MB per-cliente | Cota fixa, bloqueia ao atingir | |
| Hard cap + override coord+ | Default 50MB com override | |

**Notes:** ~20 clientes × ~50MB média = 1GB cabe folgado. Cron diário OU query on-demand para monitor.

---

## Triggers de notificação

| Option | Description | Selected |
|---|---|---|
| Cliente aprovou doc | Crítico — sinal de fechamento | ✓ |
| Cliente pediu revisão | Crítico — trigger pra retrabalho | ✓ |
| Cliente subiu doc no portal | Acelera follow-up | ✓ |
| 5+ dias sem resposta | Recovery sinal — cron diário | ✓ |

**Notes:** Todos os 4 disparam multi-canal (helper Phase 5+6 pattern). Eventos a/b/c são trigger-driven; d é cron-driven (`notify-aprovacoes-stale`).

---

## Granularidade prefs em preferencias_notif

| Option | Description | Selected |
|---|---|---|
| Tipo único 'documentos' (Recomendado) | Matriz 5×3 (5 tipos × 3 canais) | ✓ |
| 2 tipos: 'documentos_acao' + 'documentos_lembrete' | Granular: separa sync de cron | |
| 4 tipos individuais | 8×3 = 24 switches (over-engineered) | |

**Notes:** Schema migration 037 simples. Adiciona linha `documentos` na matriz NotificacoesPanel.

---

## Quem vê /portal-admin/aprovacoes-pendentes

| Option | Description | Selected |
|---|---|---|
| Coordenador+ apenas | Pattern /receita | |
| Coord+ vê tudo + Consultor vê só dos seus (Recomendado) | RLS filtra responsavel_id | ✓ |
| Todos os internos veem tudo | Sem filtro | |

**Notes:** Maximiza adoption — consultor abre página diariamente.

---

## Botão "Reenviar lembrete"

| Option | Description | Selected |
|---|---|---|
| Email + push pro cliente (Recomendado) | Destinatário certo (cliente que precisa responder); timeline registra envio | ✓ |
| Só email pro cliente | Mais conservador; push exige PWA instalado | |
| Email pro cliente + Slack pro consultor | Notifica ambos | |

**Notes:** Cliente não tem Slack. Cooldown 1h visual (não enforced backend MVP).

---

## Threshold "5+ dias"

| Option | Description | Selected |
|---|---|---|
| Configurável via configuracoes (Recomendado) | configuracoes.dias_para_aprovacao_pendente default 5; UI em /configuracoes para coord+ | ✓ |
| Hardcoded 5 dias | Simples mas exige migration pra mudar | |
| Configurável POR cliente | clientes.dias_aprovacao_default; SLA individual | |

**Notes:** Pattern já estabelecido (metas, prefs gerais). Cron lê valor antes de filtrar.

---

## Claude's Discretion

- Forma exata da signed URL (`.createSignedUrl(path, 60*60)`)
- MIME sniffing real vs extensão only (tech-debt se virar problema)
- Query "uso total bucket" (cron, função SQL, ou pg_size)
- Cooldown lembrete (visual apenas MVP)
- Timeline UI (modal, expand, side drawer)
- Soft delete vs hard delete (recomendado soft)
- Tab order em ClienteDetailPage
- `perfis.cliente_id` existence check

## Deferred Ideas

- Diff lado-a-lado v1/v2
- Assinatura digital criptográfica (eIDAS, ICP-Brasil)
- Comentários inline em PDF (post-v3.0)
- OCR / extração de texto
- DocuSign/ClickSign integration (paga)
- Hard cap per-cliente
- Cron cleanup retention
- MIME sniffing real (magic bytes)
- Cooldown enforced backend no lembrete
- Rich-text no comentário do cliente
- Push pro cliente nos 4 eventos (apenas em reenviar)
- PDF viewer inline (pdf.js)
- Tab order final em ClienteDetailPage

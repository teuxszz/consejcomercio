# Phase 5: Multi-Channel Notifications (Email) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `05-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-27
**Phase:** 5-multi-channel-notifications-email
**Areas discussed:** Roteamento canal vs per-user, Granularidade do opt-in, Rate-limit Resend, Webhook + histórico, Arquitetura+Idempotência+Templates

---

## Routing — Channel vs Per-user

| Option | Description | Selected |
|--------|-------------|----------|
| Híbrido | Canal Slack continua broadcast + per-user (DM/email) pro responsável | ✓ |
| Tudo per-user | Canal coletivo some, cada um escolhe canal | |
| Só broadcast + email lista | Canal Slack + email pra todos os internos opted-in | |

**Notes:** Híbrido preserva o sinal coletivo do Slack que a equipe já usa e adiciona email per-user para quem precisa ser acionado. Foi a recomendação.

### Destinatário per-user (renovação)

| Option | Selected |
|--------|----------|
| `contratos.responsavel_id` | ✓ |
| `clientes.responsavel_id` | |
| Ambos (com dedup) | |

### Destinatário per-user (indicação)

| Option | Selected |
|--------|----------|
| `leads.responsavel_id` do lead criado | ✓ |
| `parceiros.responsavel_id` | |
| Ambos | |

### Duplicação quando ambos marcados

| Option | Selected |
|--------|----------|
| Ambos marcados = recebe os dois | ✓ |
| Email precedence sobre Slack | |
| Slack precedence sobre Email | |

**Reinterpretação:** EMAIL-03 "Slack OU email" lido como "Slack E/OU email — cada switch independente".

### Default ao criar perfil novo

| Option | Selected |
|--------|----------|
| Smart default (email ON sempre; Slack ON se slack_user_id) | ✓ |
| Opt-in puro (tudo OFF) | |
| Tudo ON Slack+Email | |

### Responsavel_id NULL

| Option | Selected |
|--------|----------|
| Só canal Slack, email pulado | |
| Fallback diretor | ✓ |
| Broadcast email pra todos opted-in | |

### Self-loop (criador == atribuído)

| Option | Selected |
|--------|----------|
| Suprimir self-notif | ✓ |
| Manda mesmo assim | |

### Hand-off de responsável

| Option | Selected |
|--------|----------|
| Sempre responsável atual no momento do disparo | ✓ |
| Notifica antigo + novo por X dias | |

---

## Granularidade do opt-in

### Estrutura da UI

| Option | Selected |
|--------|----------|
| Matriz 4×2 com 8 switches | ✓ |
| Select por tipo (Slack/Email/Ambos/Nenhum) | |
| Master toggle + override | |

### Onde fica a UI de prefs

| Option | Selected |
|--------|----------|
| Nova tab "Notificações" em MeEspacoPage | ✓ |
| Seção dentro da tab "Perfil" | |
| Página dedicada fora de MeEspacoPage | |

### Onde fica o histórico

| Option | Selected |
|--------|----------|
| Sub-rota `/me/notificacoes-historico` | ✓ |
| Tab adicional em MeEspacoPage | |
| Modal aberto da tab Notificações | |

### Cliente também tem prefs?

| Option | Selected |
|--------|----------|
| Sim, `/portal/preferencias` com matriz reduzida | ✓ |
| Só interno, cliente fica para Phase 7 | |
| Cliente recebe tudo ON sem UI | |

### Rodapé do email

| Option | Selected |
|--------|----------|
| Link "Gerenciar preferências" com token JWT assinado | ✓ |
| Unsubscribe global 1-click | |
| Link sem auth especial (redirect login) | |

---

## Rate-limit Resend

### Comportamento no limite

| Option | Selected |
|--------|----------|
| Warning + drop com log | ✓ |
| Queue + retry no dia seguinte | |
| Fallback automático Slack >90% | |

### Quem vê o warning UI

| Option | Selected |
|--------|----------|
| Só coordenador+ em `/adocao` e `/configuracoes` | ✓ |
| Todo mundo (banner global) | |
| Sem UI, só alerta interno | |

### Threshold mensal

| Option | Selected |
|--------|----------|
| Só diário | |
| Diário + mensal (mesmo padrão) | ✓ |

---

## Webhook + Histórico

### Webhook Resend

| Option | Selected |
|--------|----------|
| Webhook completo (delivered/bounced/opened/complained) | ✓ |
| Só "sent" (POST API 200) | |
| Só bounced/complained (compliance mínimo) | |

### Visibilidade do histórico

| Option | Selected |
|--------|----------|
| Cada um vê o seu + coord+ vê todos via filtro | ✓ |
| Só cada um vê o seu | |
| Página separada para admin | |

### Quem pode reenviar

| Option | Selected |
|--------|----------|
| Próprio user + coord+ pra qualquer um, sempre visível | ✓ |
| Só pra notifs com falha/bounce | |
| Só coord+ | |

---

## Arquitetura + Idempotência + Templates

### Arquitetura de envio

| Option | Selected |
|--------|----------|
| Helper Deno compartilhado, chamada inline | ✓ |
| Edge function dedicada `notify-email` (HTTP) | |
| `notify-dispatch` central orquestra todos | |

**Reinterpretação:** EMAIL-02 "Edge function notify-email" lido como "lógica de email centralizada via helper compartilhado".

### Idempotência

| Option | Selected |
|--------|----------|
| Tabela `notificacoes_envios` UNIQUE (perfil_id, tipo, entidade_id, canal, dia) | ✓ |
| Sem idempotência | |
| Só pra cron-driven | |

### Template HTML

| Option | Selected |
|--------|----------|
| 1 template genérico com slots | |
| 4 templates específicos por tipo | ✓ |
| Texto puro | |

---

## Claude's Discretion

- Forma exata da rota `/me/preferencias` (rota dedicada que set tab vs `?tab=notificacoes`)
- Implementação do deep-link token (Supabase `signInWithOtp` vs JWT custom vs downgrade pra redirect-após-login)
- Cor exata + assets visuais dos templates HTML
- Paginação e filtros do histórico (default 50/página, filtros úteis mas não obrigatórios)
- Counter de quota (query direta vs cache TanStack Query)
- Refactor oportunista de `constantTimeAuthCheck` pra `_shared/auth.ts`

## Deferred Ideas

(Ver `05-CONTEXT.md` seção Deferred Ideas — preservadas para Phases futuras ou v2)

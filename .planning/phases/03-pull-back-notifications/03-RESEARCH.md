# Phase 3: Pull-back Notifications — Research

**Researched:** 2026-05-26
**Domain:** Supabase Edge Functions (Deno) + pg_cron + pg_net + Slack API (DM via chat.postMessage)
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-01 | DM Slack ao atribuir tarefa a um colega (extensão de `notify-tarefa`) | Edge function já existe e tem a lógica de DM. Verificado em código. |
| NOTIF-02 | DM Slack diária com resumo de tarefas + cadência (pg_cron, migration 034) | Padrão já estabelecido em migration 031. Função `cron_lembrar_tarefas_vencidas` pode ser estendida para resumo. |
| NOTIF-03 | DM Slack quando lead entra no dia de ação da cadência (cron diário) | Lógica de D-point já existe em `src/lib/cadencia.ts` — precisa ser replicada em PL/pgSQL na migration 034. |

</phase_requirements>

---

## Summary

A Phase 3 é uma **fase de extensão**, não de criação. A infraestrutura de notificações Slack já existe e funciona: a edge function `notify-tarefa` já envia DMs, o padrão pg_cron já está ativo (migration 031), e o Vault guarda os secrets. O trabalho desta fase é (1) confirmar que NOTIF-01 já está coberto pela `notify-tarefa` com Database Webhook, (2) criar a migration 034 com um job `pg_cron` diário que gera resumos matinais por consultor (NOTIF-02), e (3) adicionar ao mesmo cron a varredura de leads cujo D-point cai hoje (NOTIF-03).

A lógica de cadência existe em TypeScript (`src/lib/cadencia.ts`) e precisa ser traduzida para PL/pgSQL na migration 034. O D-point é baseado em dias desde a última interação em `interacoes_lead` — não há coluna `cadencia_iniciada_em` no schema atual (foi explicitamente deferida na Phase 2).

A edge function `notify-tarefa` precisará de uma rota de **resumo diário** separada da rota de webhook — idealmente uma nova edge function `notify-resumo-diario` ou um `?mode=resumo` na existente. O resumo precisa consolidar: (a) tarefas abertas com vencimento hoje, (b) leads em D-point hoje — e enviar uma única DM por consultor.

**Primary recommendation:** Criar migration 034 + nova edge function `notify-resumo-diario` (não modificar `notify-tarefa`). O isolamento evita regressão no fluxo de webhook de tarefas. NOTIF-01 já está implementado pelo webhook existente — verificar apenas se o Database Webhook está configurado no dashboard Supabase.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DM Slack ao atribuir tarefa (NOTIF-01) | Database Webhook → Edge Function | — | Disparo event-driven; `notify-tarefa` já é o handler correto |
| Resumo diário matinal (NOTIF-02) | pg_cron (DB layer) → Edge Function | — | Cron roda no DB onde os dados estão; edge function formata e envia |
| Alerta de cadência D-point (NOTIF-03) | pg_cron (DB layer) → Edge Function | — | Mesma migration 034; mesma chamada de edge function do resumo |
| Configuração do Database Webhook | Supabase Dashboard | — | Não é código; é configuração de plataforma |
| `perfis.slack_user_id` | Database (tabela `perfis`) | — | Mapeamento consultor → Slack ID; já existe (migration 030) |

---

## Standard Stack

### Core (sem novos pacotes — stack inteiramente existente)

| Componente | Versão/Origem | Papel | Status |
|------------|--------------|-------|--------|
| Supabase Edge Functions (Deno) | Deno runtime, `deno.land/std@0.224.0` | Handler das DMs | Já deployado |
| `@supabase/supabase-js` | `2.106.2` (verificado via npm) | Consultas ao DB dentro da edge function | Já em uso |
| pg_cron | extensão Postgres — ativa no projeto | Agendamento diário | Ativa desde migration 031 |
| pg_net | extensão Postgres — ativa no projeto | HTTP POST do DB para edge function | Ativa desde migration 031 |
| Supabase Vault | extensão nativa Supabase | Guarda secrets (Bearer tokens) | Em uso por migration 031 |
| Slack API `chat.postMessage` | API REST Slack | Envio de DMs | Padrão existente em `notify-tarefa` |
| Slack API `conversations.open` | API REST Slack | Abrir canal DM antes de postar | Padrão existente em `notify-tarefa` |

**Nenhum novo pacote npm ou Deno a instalar.** A fase é puramente SQL + TypeScript Deno.

### Package Legitimacy Audit

> Nenhum pacote externo novo instalado nesta fase. Todos os imports são de fontes já validadas no codebase existente.

| Package | Registry | Disposition |
|---------|----------|-------------|
| `https://deno.land/std@0.224.0/http/server.ts` | Deno std lib | Aprovado — já em uso |
| `https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts` | Deno std lib | Aprovado — já em uso |
| `https://esm.sh/@supabase/supabase-js@2` | esm.sh (supabase) | Aprovado — já em uso |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
NOTIF-01 (já implementado via webhook):
  INSERT/UPDATE tarefas
       │
       ▼
  Supabase Database Webhook
  (configurado no dashboard)
       │
       ▼
  Edge Function: notify-tarefa
  ├── Lê perfis.slack_user_id do destinatário
  ├── Chama conversations.open → obtem canal DM
  └── Chama chat.postMessage → entrega DM


NOTIF-02 + NOTIF-03 (migration 034 — novo):
  pg_cron: "0 10 * * *" (07:00 BRT)
       │
       ▼
  cron_resumo_diario() — PL/pgSQL SECURITY DEFINER
  ├── Para cada perfil interno com slack_user_id:
  │   ├── Conta tarefas abertas com data_vencimento::date = CURRENT_DATE
  │   ├── Encontra leads ativos com D-point = hoje
  │   │     (JOIN interacoes_lead: dias desde última = 1, 3, 5, 7 ou 10)
  │   └── Se contagem > 0: net.http_post → notify-resumo-diario
  │
  └── Edge Function: notify-resumo-diario
      ├── Recebe: { perfil_id, tarefas_hoje: N, leads_cadencia: [{nome, d_point}] }
      ├── Lê perfis.slack_user_id
      ├── Abre DM via conversations.open
      └── Envia mensagem consolidada via chat.postMessage
```

### Recommended Project Structure

```
supabase/
├── migrations/
│   └── 034_cron_resumo_diario.sql      # pg_cron + função PL/pgSQL
└── functions/
    └── notify-resumo-diario/
        └── index.ts                     # Nova edge function (resumo + cadência)

(notify-tarefa/ não modificado — NOTIF-01 já funciona)
```

### Pattern 1: pg_cron → pg_net → Edge Function (extensão do padrão de migration 031)

**What:** Job diário PL/pgSQL que escaneia dados, agrega por consultor e chama edge function com payload JSON por usuário.

**When to use:** Toda vez que o disparo é baseado em tempo (daily reminder) e não em evento de DB.

**Example (baseado em migration 031):**
```sql
-- Source: supabase/migrations/031_cron_renovacoes.sql (padrão verificado in-codebase)
CREATE OR REPLACE FUNCTION public.cron_resumo_diario()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret  TEXT;
  v_url     TEXT := 'https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-resumo-diario';
  p         RECORD;
  v_tarefas INT;
  v_leads   JSONB;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'webhook_resumo_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'cron_resumo_diario: secret webhook_resumo_secret ausente no Vault';
    RETURN;
  END IF;

  -- Itera sobre cada interno com slack_user_id mapeado
  FOR p IN
    SELECT id, slack_user_id
      FROM perfis
     WHERE tipo = 'interno'
       AND slack_user_id IS NOT NULL
  LOOP
    -- Conta tarefas vencendo hoje
    SELECT COUNT(*) INTO v_tarefas
      FROM tarefas
     WHERE atribuido_a_id = p.id
       AND status IN ('aberta', 'em_andamento')
       AND data_vencimento::date = CURRENT_DATE;

    -- Leads em D-point hoje (baseado em última interação)
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome, 'd_point', dias.n)), '[]'::jsonb)
      INTO v_leads
      FROM leads l
      JOIN LATERAL (
        SELECT (CURRENT_DATE - MAX(i.enviada_em)::date) AS n
          FROM interacoes_lead i
         WHERE i.lead_id = l.id
      ) dias ON dias.n IN (1, 3, 5, 7, 10)
     WHERE l.responsavel_id = p.id
       AND l.status NOT IN ('ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado');

    -- Só notifica se há algo para fazer
    IF v_tarefas > 0 OR jsonb_array_length(v_leads) > 0 THEN
      PERFORM net.http_post(
        url     := v_url,
        body    := jsonb_build_object(
          'perfil_id',      p.id,
          'tarefas_hoje',   v_tarefas,
          'leads_cadencia', v_leads
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_secret
        )
      );
    END IF;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'resumo-diario-consultores',
  '0 10 * * *',   -- 10:00 UTC = 07:00 BRT
  'SELECT public.cron_resumo_diario()'
);
```

### Pattern 2: Edge Function DM (extensão do padrão de notify-tarefa)

**What:** Deno edge function que recebe payload estruturado e envia DM Slack usando o padrão `conversations.open` + `chat.postMessage` já estabelecido.

**When to use:** Qualquer nova notificação por Slack DM individual.

**Example (baseado em notify-tarefa/index.ts verificado in-codebase):**
```typescript
// Source: supabase/functions/notify-tarefa/index.ts (padrão verificado)
// notify-resumo-diario/index.ts — estrutura idêntica ao notify-tarefa

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { timingSafeEqual } from 'https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ResumoDiarioPayload {
  perfil_id: string
  tarefas_hoje: number
  leads_cadencia: Array<{ id: string; nome: string; d_point: number }>
}

// Reutiliza openDmChannel + postDm — copiar utilitários de notify-tarefa.
// (não há módulo compartilhado entre edge functions neste projeto)

serve(async (req) => {
  // auth check → parse payload → findSlackUserId → openDmChannel → chat.postMessage
})
```

### Anti-Patterns to Avoid

- **Modificar notify-tarefa para suportar resumo diário:** O handler de webhook recebe o payload do Supabase Database Webhook (com `type`, `table`, `record`). Misturar o resumo nesta função quebra o contrato de interface e dificulta testes. Usar uma função separada.
- **Usar Vercel Cron para resumo:** Free tier tem 2 cron jobs/dia; mais importante, o cron precisaria ser uma API route em Vercel, duplicando o padrão pg_cron já estabelecido. O projeto usa pg_cron — seguir o padrão.
- **Calcular D-point com `cadencia_iniciada_em`:** A Phase 2 decidiu explicitamente NÃO adicionar esta coluna (CONTEXT.md Phase 2, item D-01). O D-point é calculado pelos dias desde a última `InteracaoLead`. A migration 034 deve usar `interacoes_lead` para esta lógica.
- **Uma chamada HTTP por lead/tarefa em vez de uma por consultor:** O cron deve agregar ANTES de chamar a edge function. Uma DM por consultor com resumo consolidado (NOTIF-02) — não N DMs por lead.
- **Guardar secret em variável de ambiente de código:** Seguir o padrão do projeto — secrets no Supabase Vault, lidos via `vault.decrypted_secrets`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry com backoff para Slack API | Loop manual | Padrão já em notify-tarefa (3 retries, 500ms * 2^i) | Edge case de rate-limit (429) e 5xx já cobertos |
| Auth check timing-safe | Comparação de strings direta | `timingSafeEqual` de `deno.land/std@0.224.0/crypto` | Timing attack mitigation — padrão já no codebase |
| Abertura de canal DM | `chat.postMessage` direto no U... ID | `conversations.open` → `chat.postMessage` | Postar diretamente no user_id pode falhar silenciosamente (padrão Slack) |
| Agendamento de jobs | Serverless function com timer | `pg_cron` (já ativo) | Corre onde os dados estão; sem custo extra |
| Cálculo de dias entre datas em PL/pgSQL | Funções personalizadas | `CURRENT_DATE - data::date` (aritmética nativa de Postgres) | Postgres date arithmetic é exata para diffs em dias |

---

## Common Pitfalls

### Pitfall 1: D-point com leads sem nenhuma interação

**What goes wrong:** A query de D-point usa `MAX(interacoes_lead.enviada_em)`. Para leads sem interação, o `JOIN LATERAL` retorna NULL e o lead não entra no alerta — mas na lógica de negócio, leads sem interação criados há 0-1 dias estão no D1.

**Why it happens:** `NULL IN (1, 3, 5, 7, 10)` é sempre falso.

**How to avoid:** Adicionar um segundo branch na query: leads sem nenhuma interação criados há 0 ou 1 dias devem aparecer como D1. Exemplo PL/pgSQL:
```sql
-- Leads COM interação (D-point baseado em última interação)
SELECT l.id, l.nome, (CURRENT_DATE - MAX(i.enviada_em)::date) AS n
  FROM leads l JOIN interacoes_lead i ON i.lead_id = l.id
 WHERE l.responsavel_id = p.id
   AND l.status NOT IN (...)
 GROUP BY l.id, l.nome
HAVING (CURRENT_DATE - MAX(i.enviada_em)::date) IN (1, 3, 5, 7, 10)

UNION ALL

-- Leads SEM interação (D1 se criado hoje ou ontem)
SELECT l.id, l.nome, (CURRENT_DATE - l.created_at::date) AS n
  FROM leads l
 WHERE l.responsavel_id = p.id
   AND l.status NOT IN (...)
   AND NOT EXISTS (SELECT 1 FROM interacoes_lead i WHERE i.lead_id = l.id)
   AND (CURRENT_DATE - l.created_at::date) IN (0, 1)
```

**Warning signs:** Testes com lead novo sem interação não aparecendo no alerta.

---

### Pitfall 2: Secret ausente no Vault não interrompe o cron com erro visível

**What goes wrong:** Se `webhook_resumo_secret` não estiver no Vault antes de rodar a migration 034, a função executa sem notificar ninguém e o pg_cron reporta a run como success (sem exceção).

**Why it happens:** A função usa `RAISE WARNING` (não `RAISE EXCEPTION`) para evitar rollback do job, seguindo o padrão de migration 031.

**How to avoid:** O secret deve ser inserido no Vault ANTES da migration:
```sql
-- Rodar uma vez, fora do git (nunca versionar secrets)
SELECT vault.create_secret('<valor_do_secret>', 'webhook_resumo_secret', 'Bearer p/ notify-resumo-diario');
```
Planner deve incluir task de pré-requisito: "Configurar secret no Vault antes de aplicar migration 034".

**Warning signs:** Migration aplicada com sucesso, cron agendado, mas nenhuma DM enviada de manhã.

---

### Pitfall 3: Database Webhook não configurado para NOTIF-01

**What goes wrong:** A edge function `notify-tarefa` existe e está deployada, mas o Database Webhook que a chama em INSERT/UPDATE de `tarefas` pode não estar configurado no dashboard Supabase (é configuração de plataforma, não código).

**Why it happens:** Webhooks Supabase são configurados via UI (`Database → Webhooks`) ou via CLI — não são commitados em migrações.

**How to avoid:** Verificar no Supabase Dashboard → Database → Webhooks se existe webhook apontando para `notify-tarefa`. Se não existir, criar:
- Trigger on: `tarefas` INSERT e UPDATE
- URL: `https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-tarefa`
- HTTP Header: `Authorization: Bearer <WEBHOOK_TAREFA_SECRET>`

**Warning signs:** Tarefa atribuída mas nenhuma DM recebida; testar com `notify-tarefa` chamada diretamente via curl com payload de INSERT.

---

### Pitfall 4: Leads em stage terminal aparecem no alerta de cadência

**What goes wrong:** Leads com `status IN ('ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado')` podem ter interações recentes e aparecer no alerta mesmo não sendo acionáveis.

**Why it happens:** A query de D-point precisa do filtro de stage terminal — o mesmo que `cadencia.ts` usa via `TERMINAL_STAGES`.

**How to avoid:** Adicionar `WHERE l.status NOT IN ('ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado')` na query da migration 034. Verificar os valores exatos em `src/lib/constants.ts` (`TERMINAL_STAGES`).

**Warning signs:** Alerta enviado para lead que já foi ganho.

---

### Pitfall 5: Múltiplas DMs por consultor se o cron for chamado mais de uma vez

**What goes wrong:** Se o cron tiver algum problema de configuração e executar 2x no dia, o consultor recebe 2 resumos idênticos.

**Why it happens:** Diferente do padrão de renovações (que usa tabela de idempotência por contrato+janela), o resumo diário não tem tabela de deduplicação.

**How to avoid:** Para Milestone 2 com time de 2-5 pessoas, re-envio acidental é aceitável (mesmo risco existe em migration 031). Se quiser prevenção: adicionar tabela `resumos_diarios_enviados(perfil_id, data_envio DATE, UNIQUE(perfil_id, data_envio))` e checar antes de enviar. Decisão de implementação para o planner.

---

## Code Examples

### Padrão de cron_job da migration 031 (referência canônica)

```sql
-- Source: supabase/migrations/031_cron_renovacoes.sql (verificado in-codebase)
-- Padrão de leitura de secret do Vault
SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
 WHERE name = 'webhook_renovacao_secret';

IF v_secret IS NULL THEN
  RAISE WARNING 'cron_disparar_renovacoes: secret webhook_renovacao_secret ausente no Vault';
  RETURN;
END IF;

-- Padrão de chamada HTTP via pg_net
PERFORM net.http_post(
  url     := v_url,
  body    := jsonb_build_object('chave', 'valor'),
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_secret
  )
);

-- Padrão de agendamento (idempotente — mesmo job name atualiza)
SELECT cron.schedule(
  'nome-do-job',
  '0 12 * * *',
  'SELECT public.nome_da_funcao()'
);
```

### Padrão de openDmChannel + postDm (notify-tarefa — verificado in-codebase)

```typescript
// Source: supabase/functions/notify-tarefa/index.ts
async function openDmChannel(slackUserId: string): Promise<{ ok: boolean; channel?: string; error?: string }> {
  const res = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ users: slackUserId }),
  })
  const body = await res.json() as { ok: boolean; channel?: { id: string }; error?: string }
  if (!body.ok || !body.channel) return { ok: false, error: body.error ?? `HTTP ${res.status}` }
  return { ok: true, channel: body.channel.id }
}

// Retry com exponential backoff (3 tentativas):
for (let i = 0; i < 3; i++) {
  const res = await fetch('https://slack.com/api/chat.postMessage', { ... })
  if (res.status === 429 || res.status >= 500) {
    await new Promise(r => setTimeout(r, 500 * 2 ** i))
    continue
  }
  const body = await res.json() as { ok: boolean; ts?: string; error?: string }
  return body.ok ? { ok: true, ts: body.ts } : { ok: false, error: body.error }
}
```

### Lógica de D-point em TypeScript (src/lib/cadencia.ts — a ser replicada em PL/pgSQL)

```typescript
// Source: src/lib/cadencia.ts (verificado in-codebase)
// CADENCIA_DIAS = [{ dia: 1 }, { dia: 3 }, { dia: 5 }, { dia: 7 }, { dia: 10 }]
// Lógica: dias desde ÚLTIMA interação (ou desde created_at se sem interação)
// Encontra ponto onde dia === diasDesdeUltima
// TERMINAL_STAGES = ['ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado']
// (verificado em src/lib/constants.ts via Grep)
```

### Formato da DM de resumo (proposta — Claude's discretion)

```
Bom dia, [Nome]! Aqui está seu resumo de hoje:

📋 *Tarefas para hoje:* 3 tarefas vencendo
📞 *Cadência:* 2 leads aguardando contato
  • Empresa Alfa (D3)
  • Empresa Beta (D7)

[Abrir CRM] → link para /me ou /cadencia
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vercel Cron (2 jobs/dia, serverless) | pg_cron + pg_net | Migration 031 (Milestone 2) | Cron roda no DB, sem cold start de serverless; ilimitado no plano atual |
| `chat.postMessage` direto no user_id | `conversations.open` → `chat.postMessage` | Migration notify-tarefa (Milestone 2) | Entrega garantida; postar no user_id falha silenciosamente em algumas configs Slack |

**Deprecated/outdated:**
- `api/cron-renovacoes.ts` (Vercel Cron original): substituído por `031_cron_renovacoes.sql`. Não recriar esse padrão para a Phase 3.

---

## Runtime State Inventory

> Fase é extensão/criação de infraestrutura de notificações — não é rename/refactor. Incluído apenas para documentar o estado de configuração de plataforma.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `perfis.slack_user_id` — campo preenchido manualmente por consultor/admin via configurações | Dados existentes são usados; nenhuma migração de dados necessária |
| Live service config | Database Webhook para `notify-tarefa`: existência não verificável via código (configurado no dashboard Supabase) | Verificar no dashboard; criar se ausente |
| OS-registered state | pg_cron job `disparar-renovacoes` ativo (desde migration 031) | Novo job `resumo-diario-consultores` será adicionado |
| Secrets/env vars | `WEBHOOK_TAREFA_SECRET` (Vault + env da edge function); `SLACK_BOT_TOKEN`; `APP_URL` — todos necessários para a nova edge function | `webhook_resumo_secret` precisa ser criado no Vault antes de migration 034 |
| Build artifacts | Edge functions deployadas no Supabase cloud: `notify-tarefa`, `notify-renovacao`, `notify-indicacao`, `slack-proxy`, `slack-commands` | Nova edge function `notify-resumo-diario` precisa de deploy via `supabase functions deploy` |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pg_cron | Migration 034 (NOTIF-02, NOTIF-03) | Confirmado | ativa | — |
| pg_net | Migration 034 | Confirmado | ativa | — |
| Supabase Vault | Migration 034 (secrets) | Confirmado | ativa | — |
| SLACK_BOT_TOKEN | Edge function | Assumido presente | — | Sem fallback — obrigatório |
| Supabase CLI | Deploy `notify-resumo-diario` | Assumido disponível localmente | — | Deploy via dashboard (manual) |
| `supabase db push` | Aplicar migration 034 | Assumido disponível | — | Aplicar via SQL editor do dashboard |

**Missing dependencies with no fallback:**
- `SLACK_BOT_TOKEN` configurado como secret da edge function e como env da edge function existente. Se ausente, todas as notificações falham silenciosamente.

**Missing dependencies with fallback:**
- Supabase CLI: se não disponível, migration e deploy podem ser feitos via dashboard.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` (17 suites, 123 tests atualmente) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-01 | DM Slack ao atribuir tarefa (edge function já implementada) | manual-only | N/A — testar via Supabase dashboard trigger ou curl | N/A |
| NOTIF-02 | Cron diário consolida tarefas+cadência por consultor | unit | `npm run test -- src/lib/__tests__/cadencia-resumo.test.ts` | ❌ Wave 0 |
| NOTIF-03 | D-point correto identificado para leads sem/com interações | unit (extensão de cadencia.test.ts) | `npm run test -- src/lib/__tests__/cadencia.test.ts` | ✅ existente |

**Justificativa para manual-only (NOTIF-01):** A edge function `notify-tarefa` é Deno e não roda no ambiente Vitest/jsdom. O teste correto é um integration test via `supabase functions serve` + request manual. Para Milestone 2 com 2-5 usuários, o esforço de teste de integração de edge function não é proporcional ao risco.

**Justificativa para NOTIF-02/03:** A lógica de cálculo de D-point para o cron é PL/pgSQL, não TypeScript. O que pode ser testado em Vitest é a **lógica de negócio** (quais leads/dias são elegíveis) — não o SQL em si. A função `getNextCadenciaPoint` já tem 14 testes cobrindo D-point. Novos testes devem cobrir o caso de leads sem interação (D1 por dias desde criação).

### Sampling Rate

- **Per task commit:** `npm run test` (< 45s)
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green (123+ tests) antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Verificar se Database Webhook para `notify-tarefa` está configurado no dashboard — task de setup de plataforma, não código
- [ ] `webhook_resumo_secret` no Supabase Vault antes de aplicar migration 034
- [ ] Deploy da edge function `notify-resumo-diario` após criação do arquivo

*(Se nenhum novo teste unitário for criado: "None — edge functions não são testáveis em Vitest; lógica de D-point já coberta em cadencia.test.ts")*

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` em config.json.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Sim (edge functions) | `timingSafeEqual` para Bearer token — padrão já em uso em todas as edge functions |
| V3 Session Management | Não | Edge functions são stateless; não gerenciam sessão |
| V4 Access Control | Sim | `SECURITY DEFINER` nas funções PL/pgSQL; apenas internos com `slack_user_id` recebem DM |
| V5 Input Validation | Sim | Payload da edge function deve validar tipos (`typeof payload.tarefas_hoje === 'number'`) |
| V6 Cryptography | Não | Não há operações criptográficas novas — secrets no Vault |

### Known Threat Patterns for Edge Functions + pg_cron

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook (chamada sem auth) | Spoofing | `timingSafeEqual` Bearer check — padrão existente em `notify-tarefa` |
| Secret exposto em migration SQL | Information Disclosure | Secrets NUNCA em SQL commitado; sempre via Vault (padrão do projeto) |
| SSRF via pg_net | Elevation of Privilege | `v_url` hardcoded no SQL da função; não interpolado de dados do usuário |
| DM enviada para usuário errado | Spoofing | `perfil_id` vem do scan de `perfis` com `SECURITY DEFINER`; não de input externo |
| Injeção SQL no PL/pgSQL | Tampering | Payload da edge function → JSON; sem interpolação de string em SQL dinâmico |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Database Webhook para `notify-tarefa` (INSERT/UPDATE de tarefas) está configurado no dashboard Supabase | Architecture Patterns, Common Pitfalls | NOTIF-01 não funciona sem webhook; time não recebe DM ao receber tarefa |
| A2 | `SLACK_BOT_TOKEN` e `WEBHOOK_TAREFA_SECRET` estão configurados como secrets da edge function `notify-tarefa` no Supabase | Environment Availability | Sem token, todas as DMs falham; o padrão funcional de `notify-renovacao` sugere que estão configurados |
| A3 | A lógica de D-point sem `cadencia_iniciada_em` (baseada em `interacoes_lead`) é suficiente para NOTIF-03 | Architecture Patterns | Leva ao mesmo D-point mostrado no frontend (Phase 2 usou a mesma lógica); risco baixo |
| A4 | `TERMINAL_STAGES = ['ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado']` — estes são os valores exatos em produção | Common Pitfalls (Pitfall 4) | Leads terminais apareceriam no alerta; verificar em `src/lib/constants.ts` antes de codar |

---

## Open Questions (RESOLVED)

1. **NOTIF-01 já está 100% funcional ou precisa de alguma alteração?** **(RESOLVED)**
   - O que sabíamos: edge function `notify-tarefa` existe com lógica de DM para INSERT/UPDATE; coluna `notificar` (SEC-02) já está em migration 033; código já verifica `notificar === false`.
   - O que estava incerto: se o Database Webhook está configurado no dashboard Supabase.
   - **DECISÃO (RESOLVED):** o planner incluiu task de verificação/configuração do Database Webhook como parte de Wave 0 (validação manual no Supabase Dashboard → Database → Webhooks). NOTIF-01 é tratado como "já implementado em código" — sem nova feature; apenas conferência de configuração de plataforma.

2. **Usar `notify-tarefa` estendida ou nova edge function `notify-resumo-diario`?** **(RESOLVED)**
   - O que sabíamos: `notify-tarefa` recebe payload de Database Webhook (com `type`, `table`, `record`). Adicionar um modo `?mode=resumo` ou `type === 'RESUMO'` é possível mas mistura contratos.
   - O que estava incerto: se o time tem preferência por coesão vs. isolamento.
   - **DECISÃO (RESOLVED):** criar **nova edge function `notify-resumo-diario`** — isolamento previne regressão no webhook de tarefas e facilita teste independente. Implementado no PLAN 03-02, Task 2.

3. **Idempotência no resumo diário (NOTIF-02/NOTIF-03)?** **(RESOLVED)**
   - O que sabíamos: `notify-renovacao` usa tabela de idempotência; `notify-tarefa` não usa (DMs são eventos únicos).
   - O que estava incerto: se re-envio acidental (execução dupla do cron) é aceitável para um time de 2-5 pessoas.
   - **DECISÃO (RESOLVED):** para Milestone 2, **aceitar re-envio sem tabela de idempotência** (T-03-02-07 marcado como `accept` no threat model do PLAN 03-02). Adicionar `resumos_diarios_enviados` apenas se reclamação aparecer em uso real.

4. **Status `'stand_by'` deve ser excluído do `NOT IN (...)` na query de cadência?** **(RESOLVED)**
   - O que sabíamos: PATTERNS.md alertou para o caso, e RESEARCH.md (Pitfall 4) lista apenas os 4 status terminais.
   - O que estava incerto: se `'stand_by'` existe atualmente como status válido em `leads.status`.
   - **DECISÃO (RESOLVED):** PLAN 03-02 Task 2 inclui pré-decisão runtime — executar `SELECT DISTINCT status FROM leads` ANTES de escrever a query SQL. Se `'stand_by'` (ou variação) existir, EXCLUIR do alerta de cadência (lead pausado não deve ser cobrado) e documentar em comentário SQL. Se não existir, documentar a ausência em comentário SQL. Resultado da consulta é registrado em `03-02-CRON-DEPLOY-LOG.md`.

---

## Sources

### Primary (HIGH confidence)
- `supabase/functions/notify-tarefa/index.ts` — implementação completa do padrão DM Slack com `conversations.open` + `chat.postMessage` + retry
- `supabase/migrations/031_cron_renovacoes.sql` — padrão canônico de pg_cron + pg_net + Vault no projeto
- `supabase/migrations/033_rls_tarefas_notificar.sql` — confirmação de que coluna `notificar` já existe
- `supabase/migrations/030_perfis_slack.sql` — confirmação de que `perfis.slack_user_id` existe com índice
- `src/lib/cadencia.ts` — lógica de D-point que deve ser replicada em PL/pgSQL
- `.planning/phases/02-cadence-guide-whatsapp-quick-actions/02-CONTEXT.md` — decisão D-01: sem `cadencia_iniciada_em`, usar `interacoes_lead`
- `.planning/research/ARCHITECTURE.md` — análise prévia de arquitetura de notificações e cron

### Secondary (MEDIUM confidence)
- `npm view @supabase/supabase-js version` → `2.106.2` (verificado em runtime)

### Tertiary (LOW confidence)
- Comportamento do Supabase Database Webhook (existência da configuração): assumido com base na documentação do projeto e presença da edge function deployada [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — todos os componentes estão em uso no codebase; nenhum pacote novo
- Architecture: HIGH — baseada em padrão existente e verificado (migration 031 + notify-tarefa)
- Pitfalls: HIGH — derivados de análise direta do código e da lógica de D-point existente
- NOTIF-01 status: MEDIUM — edge function existe e está correta; webhook de plataforma não verificável via código

**Research date:** 2026-05-26
**Valid until:** 2026-06-26 (stack estável; prazo menor se Supabase mudar APIs de Edge Functions)

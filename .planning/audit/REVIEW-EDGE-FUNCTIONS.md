---
audit: edge-functions-security
reviewed: 2026-07-13
depth: deep
scope: supabase/functions/**/*.ts (excl. __tests__)
files_reviewed: 25
findings:
  critical: 2
  warning: 10
  info: 3
  total: 15
status: issues_found
---

# Auditoria de Segurança — Edge Functions (server-side)

**Projeto:** CONSEJ CRM v2
**Escopo:** 25 arquivos `.ts` em `supabase/functions/**`
**Contexto de ameaça:** Todas as funções `notify-*`, `smoke-push`, `resend-webhook` e `slack-commands` rodam com `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS integralmente) e foram deployadas com `--no-verify-jwt` (confirmado em `.planning/phases/03-pull-back-notifications/03-02-CRON-DEPLOY-LOG.md:103`, `07-02-SUMMARY.md:60-64`, `06-SECURITY.md:35`). Isso significa que **a camada de auth externa do Supabase está desligada** e a única fronteira de autenticação é o código da própria função.

---

## Sumário executivo

| # | Sev | Achado | Arquivo |
|---|-----|--------|---------|
| CR-01 | **CRITICAL** | Auth de webhook **fail-open** em 6 funções service-role publicamente invocáveis | `notify-*/index.ts` |
| CR-02 | **CRITICAL** | HTML injection / XSS via `comentario_cliente` do portal em e-mail para consultor | `_shared/aprovacoes.ts:101-108` |
| WR-01 | WARNING | `reenviar-notificacao` bypassa a quota Resend → email-bomb / exaustão de quota | `reenviar-notificacao/index.ts:189-236` |
| WR-02 | WARNING | Idempotência "poison row": falha transitória suprime a notificação para sempre | `notify-renovacao/index.ts:191-228` |
| WR-03 | WARNING | `deepLink` interpolado sem escape dentro de `href="..."` | `_shared/templates/render.ts:36` |
| WR-04 | WARNING | Slack mrkdwn injection a partir de campos preenchidos pelo cliente no portal | `notify-indicacao/slack.ts:29-97` |
| WR-05 | WARNING | `.ilike('id::text', ...)` — filtro PostgREST inválido + wildcards do usuário | `slack-commands/index.ts:149` |
| WR-06 | WARNING | CORS `*` em endpoint autenticado que muta e dispara e-mail | `reenviar-notificacao/index.ts:51-55` |
| WR-07 | WARNING | `smoke-push` — endpoint de diagnóstico público mantido em produção | `smoke-push/index.ts:52` |
| WR-08 | WARNING | Qualquer membro do workspace Slack cria lead, mesmo sem perfil mapeado | `slack-commands/index.ts:186-221` |
| WR-09 | WARNING | `deepLink` de documentos quebrado (`${''}` morto) | `_shared/aprovacoes.ts:130` |
| WR-10 | WARNING | `resend-webhook` sem dedup de `svix-id` → replay dentro da janela de 5 min | `resend-webhook/index.ts:55-80` |
| IN-01 | INFO | Confirmação: R6 (`RESEND_API_KEY` nunca em log/error_msg) — **verdadeiro** | `_shared/email.ts:18` |
| IN-02 | INFO | `constantTimeAuthCheck` vaza o comprimento do secret | `_shared/auth.ts:17-21` |
| IN-03 | INFO | `resend-webhook`: código morto + `delivered_at` escrito em regressão de status | `resend-webhook/index.ts:141-151` |

---

## O que está CORRETO (verificado explicitamente)

Conforme pedido, confirmo o que **não** é vulnerável:

- **`slack-commands` — verificação de assinatura Slack: CORRETA.** (`index.ts:101-115`) Valida presença de `x-slack-request-timestamp` e `x-slack-signature`; rejeita timestamp com skew > 5 min (`:110`, anti-replay); computa `v0=HMAC-SHA256(SLACK_SIGNING_SECRET, "v0:"+ts+":"+rawBody)` sobre o **corpo cru** (`:112`, lido antes de qualquer parse em `:278`); compara em tempo constante (`:94-99`). **Fail-closed** se o secret estiver ausente (`:102 return false`). Implementação de referência — é o padrão que as `notify-*` deveriam seguir.
- **`resend-webhook` — verificação Svix: CORRETA.** (`verify.ts:24-61`) Faz o passo que quase todo mundo erra: **decodifica o base64 do secret** antes de usá-lo como chave HMAC (`:34-40`); assina `${svixId}.${svixTimestamp}.${body}`; suporta múltiplas assinaturas (rotação); compara em tempo constante; janela de replay de 5 min (`:74-79`). E **falha fechado**: `index.ts:74-76` retorna 500 se `WEBHOOK_RESEND_SECRET` estiver ausente — exatamente o oposto das `notify-*`.
- **`slack-proxy` — autorização: CORRETA.** (`index.ts:50-69`) Valida o JWT via `adminClient.auth.getUser(jwt)` e **exige `perfis.tipo === 'interno'`** — cliente do portal é barrado com 403. CORS por allowlist explícita (`:9-23`), não `*`.
- **Sem SSRF em `slack-proxy`.** `channel`/`user` são validados por regex (`/^[CDU][A-Z0-9]{8,}$/`, `:95`, `:101`) e `limit`/`cursor` passam por `URLSearchParams` (encoding automático). A URL base é constante — não há caminho para o atacante controlar o host do `fetch`.
- **Sem secrets hardcoded** em nenhuma das 25 funções. Todos vêm de `Deno.env.get()`. As migrations (031/034/038) leem os secrets do **Supabase Vault** (`vault.decrypted_secrets`), nunca hardcoded — e fazem `RAISE WARNING` + `RETURN` se o secret faltar (fail-closed no lado do chamador).
- **`_shared/templates/render.ts` escapa** todas as variáveis de texto (`escapeHtml` em `nomeAtribuido`, `tituloTarefa`, `nomeCliente`, `segmento`, etc.). O problema de XSS (CR-02) está **apenas** em `_shared/aprovacoes.ts`, que não usa esse módulo.
- **Sem SQL injection.** Todo acesso a dados é via PostgREST builder (`.eq()`, `.select()`), que parametriza. Nenhum `rpc()` com string concatenada.

---

## CRITICAL

### CR-01: Auth de webhook **fail-open** — funções service-role abertas à internet se o secret não estiver setado

**Arquivos:**
- `supabase/functions/notify-tarefa/index.ts:120-125`
- `supabase/functions/notify-indicacao/index.ts:279-284`
- `supabase/functions/notify-renovacao/index.ts:168-173`
- `supabase/functions/notify-resumo-diario/index.ts:90-95`
- `supabase/functions/notify-aprovacao-evento/index.ts:75-80`
- `supabase/functions/notify-aprovacoes-stale/index.ts:63-68`

**O problema:** as seis funções guardam a checagem de auth atrás de um `if` que testa a *existência do próprio secret*:

```ts
if (WEBHOOK_SECRET) {                       // ← se o env var não existe, NADA é checado
  const auth = req.headers.get('Authorization') ?? ''
  if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }
}
// ...segue o fluxo com SERVICE_ROLE_KEY, sem nenhuma outra checagem
```

Se `WEBHOOK_TAREFA_SECRET` (ou `_INDICACAO_`, `_RENOVACAO_`, `_RESUMO_`, `_APROVACAO_`) estiver **ausente, vazio ou com typo** no painel de Function Secrets, a função passa a aceitar **qualquer POST anônimo da internet**, executando com `SUPABASE_SERVICE_ROLE_KEY` (RLS totalmente bypassada).

Não há defesa em profundidade: o `--no-verify-jwt` foi aplicado justamente para desligar a camada externa do Supabase (`07-02-SUMMARY.md:75`: *"nossa auth boundary é o HMAC interno `constantTimeAuthCheck`"*). Se essa única fronteira se auto-desliga, não sobra nada.

O risco é concreto porque o secret vive **em dois lugares que podem divergir**: no Postgres Vault (`webhook_resumo_secret`, usado pelo `pg_cron`) e no env da Edge Function (`WEBHOOK_RESUMO_SECRET`). Rotacionar/remover um sem o outro, ou provisionar uma função nova sem lembrar do secret, abre a função silenciosamente — sem erro, sem log, sem alerta. Note que o lado do banco é fail-**closed** (migration `034:50-51` faz `RAISE WARNING` e não chama), então o sintoma de "secret faltando" é *notificação que não chega* — não "função exposta". A equipe corrigiria o Vault e nunca perceberia que a função ficou aberta.

**Cenário de exploração concreto (`notify-tarefa`):**

```bash
# Sem nenhum header de auth. Endpoint é público (--no-verify-jwt).
curl -X POST https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-tarefa \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "INSERT",
    "table": "tarefas",
    "record": {
      "id": "3f2b1a44-0000-4000-8000-000000000001",
      "titulo": "Ação urgente: <https://consej-crm.com.br.evil.tld/login|revalide seu acesso ao CRM>",
      "descricao": "Sua sessão expira hoje. Confirme suas credenciais.",
      "prioridade": "critica",
      "tipo": "followup",
      "status": "pendente",
      "atribuido_a_id": "<uuid do diretor — enumerável>",
      "criado_por_id": null,
      "entidade_tipo": "tarefa",
      "entidade_id": "3f2b1a44-0000-4000-8000-000000000001",
      "data_vencimento": null,
      "notificar": true
    }
  }'
```

O atacante consegue:
1. **Phishing via o bot oficial da CONSEJ no Slack.** `titulo` e `descricao` caem direto em blocos `mrkdwn` (`notify-tarefa:278`), e o mrkdwn do Slack renderiza `<url|texto>` como link clicável. A DM chega do bot legítimo da empresa — credibilidade máxima.
2. **Phishing por e-mail** com o mesmo conteúdo, do remetente configurado, para o alvo escolhido (`sendEmail`, `:258`).
3. **Push notification** com título/corpo controlados (`sendPush`, `:236`).
4. **Escrita arbitrária em `notificacoes_envios`** (poluição de auditoria, e — combinado com a idempotência UNIQUE por dia — **supressão** de notificações legítimas: pré-inserir a linha do dia para `(perfil, tipo, canal, entidade)` faz a notificação real ser descartada como `skipped_idempotent`).
5. **Exaustão da quota Resend** (100/dia, 3000/mês): ~100 requests derrubam todo o e-mail transacional do dia; os envios legítimos viram `dropped_quota` (`_shared/email.ts:115-130`).

Em `notify-resumo-diario` é ainda mais direto — o payload é totalmente inventado pelo chamador (`perfil_id`, `tarefas_hoje`, `leads_cadencia[].nome`), e `leads_cadencia[].nome` é interpolado em mrkdwn sem sanitização (`notify-resumo-diario:54`).

**Correção:** falhar fechado. O secret ausente é um erro de configuração, não uma permissão.

```ts
// _shared/auth.ts — nova função, usar em TODAS as notify-*
export function requireWebhookAuth(req: Request, secret: string | undefined): Response | null {
  if (!secret) {
    console.error('[auth] WEBHOOK_SECRET ausente — recusando request (fail-closed)')
    return new Response(
      JSON.stringify({ ok: false, error: 'server misconfigured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const auth = req.headers.get('Authorization') ?? ''
  if (!constantTimeAuthCheck(auth, secret)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }
  return null
}
```

```ts
// em cada notify-*/index.ts, substituir o bloco `if (WEBHOOK_SECRET) { ... }` por:
const authErr = requireWebhookAuth(req, WEBHOOK_SECRET)
if (authErr) return authErr
```

Ações complementares:
1. **Auditar agora** quais secrets estão de fato setados: `supabase secrets list --project-ref wfnriqwkzdazdbuzbyug` e confirmar `WEBHOOK_TAREFA_SECRET`, `WEBHOOK_INDICACAO_SECRET`, `WEBHOOK_RENOVACAO_SECRET`, `WEBHOOK_RESUMO_SECRET`, `WEBHOOK_APROVACAO_SECRET`. Se algum estiver faltando, a função **está exposta em produção agora**.
2. Validar `payload.record` contra um schema (Zod/manual) — o webhook do Postgres tem shape conhecido; `titulo`/`descricao` devem ter limite de tamanho, e `entidade_tipo` precisa de allowlist (`'lead' | 'cliente' | 'contrato' | 'tarefa'`).
3. Preferir **re-ler a entidade do banco pelo `record.id`** em vez de confiar no `record` do payload. O webhook diz "a tarefa X mudou"; a função deveria buscar a tarefa X. Isso neutraliza toda a classe de payload forjado, mesmo que a auth falhe.

---

### CR-02: HTML injection / XSS — `comentario_cliente` do portal renderizado sem escape no e-mail do consultor

**Arquivo:** `supabase/functions/_shared/aprovacoes.ts:101-108` (dados montados em `:76-100`, `:129-131`)

**O problema:** `bodyFor()` monta o HTML do e-mail por interpolação crua:

```ts
const html = `
  <div style="...">
    <p style="white-space: pre-line;">${plain}</p>     // ← SEM escape
    <p style="margin-top: 24px;">
      <a href="${deepLink}" style="...">Abrir documento</a>
    </p>
  </div>
`.trim()
```

`plain` é construído (`:84-100`) a partir de `clienteNome`, `docNome` e — o pior — `comentario`:

```ts
plain = `${clienteNome} pediu revisão no documento "${docNome}".`
if (comentario && comentario.trim().length > 0) {
  plain += `\n\nComentário: ${comentario}`
}
```

`comentario` é `payload.comentario_cliente`, que vem do trigger da migration 038 sobre `cliente_docs` — ou seja, **é texto livre digitado pelo CLIENTE no Portal** ao pedir revisão de um documento. `docNomeArquivo` é o **nome do arquivo que o cliente subiu**. Ambos vão direto para o corpo HTML do e-mail enviado ao consultor interno.

Isso contradiz frontalmente o comentário do próprio arquivo (`:5`, *"Espelha 1:1 o pattern de `_shared/email.ts` + `_shared/push.ts`"*) e a regra explícita de `_shared/templates/render.ts:3-6` (*"escapeHtml em TODOS os textos ... previne XSS em e-mail clients"*). Este é o único caminho de e-mail que **não** passa por `render.ts`.

**Cenário de exploração concreto:** um cliente do Portal (auth de cliente, o nível mais baixo de privilégio do sistema) abre um documento e clica em "Pedir revisão", com o comentário:

```html
Perfeito, só um ajuste.<br><br>
<a href="https://consej-crm.com.br.evil.tld/login">
  Documento revisado — clique para assinar
</a>
<img src="https://evil.tld/beacon.gif?vitima=consultor">
```

O consultor responsável recebe um e-mail **legítimo, do domínio da CONSEJ, com `X-Entity-Ref-ID` válido**, contendo um link de phishing indistinguível do CTA real ("Abrir documento") logo abaixo, mais um beacon que confirma a abertura. Em clientes de e-mail que executam mais markup (Outlook desktop, webviews), o vetor cresce (`<style>`, `onerror=`, `<base href>` para sequestrar o link real). Mesmo no pior caso conservador — só `<a>` e `<img>` sobrevivem — é phishing interno com pretexto perfeito, partindo de uma conta de cliente.

O mesmo `plain` também alimenta o push (`:179`, `body: plain.slice(0,150)`) e o Slack (`:148`, `_${p.comentarioCliente}_` em mrkdwn) — o Slack sofre a variante mrkdwn (`<url|texto>`).

**Correção:** escapar tudo que é texto, mantendo `deepLink` (que é gerado internamente) fora do escape — exatamente como `render.ts` já faz. Reusar o helper existente:

```ts
import { escapeHtml } from './templates/render.ts'

function bodyFor(
  e: EventoAprovacao,
  clienteNome: string,
  docNome: string,
  comentario: string | null | undefined,
  deepLink: string,
): { plain: string; html: string } {
  let plain = ''
  switch (e) {
    /* ...monta `plain` como hoje (texto puro, usado no push/slack)... */
  }

  // HTML: escapar o texto; \n → <br> só DEPOIS do escape.
  const safeBody = escapeHtml(plain).replaceAll('\n', '<br>')
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <p>${safeBody}</p>
      <p style="margin-top: 24px;">
        <a href="${encodeURI(deepLink)}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Abrir documento</a>
      </p>
    </div>
  `.trim()
  return { plain, html }
}
```

Adicionalmente: no bloco Slack (`:148`), sanitizar `p.comentarioCliente` removendo `<`, `>` e `|` (Slack mrkdwn só forma link com `<...|...>`), e limitar o comentário a ~500 chars. Idealmente, migrar `aprovacoes.ts` para um template em `_shared/templates/` para que a regra de escape valha por construção e não por disciplina.

---

## WARNING

### WR-01: `reenviar-notificacao` bypassa a quota Resend — email-bomb e exaustão de quota

**Arquivo:** `supabase/functions/reenviar-notificacao/index.ts:189-236`

O header do arquivo assume explicitamente que **não** usa `sendEmail()` (`:16-18`, para evitar conflito com o INSERT idempotente). Consequência não intencional: também pula o `checkQuota()` (`_shared/email.ts:114`) e o índice UNIQUE de idempotência (o índice parcial é `WHERE reenviado_por_id IS NULL`, e o reenvio seta esse campo — `:175`). Não há rate limit, nem cooldown, nem limite por usuário/dia.

**Exploração:** qualquer usuário interno autenticado (inclusive um `consultor`, o menor privilégio interno) faz um loop:

```js
for (let i = 0; i < 5000; i++) {
  await supabase.functions.invoke('reenviar-notificacao', { body: { id: notifId } })
}
```

Resultado: (a) 5000 e-mails para o destinatário da notificação original — assédio/email-bomb; (b) a quota do Resend (100/dia, 3000/mês) estoura, e **todas** as notificações legítimas do CRM passam a cair em `dropped_quota` (`_shared/email.ts:115`) — negação de serviço em todo o sistema de notificação; (c) reputação do domínio de envio afetada. Note que uma conta interna comprometida (ou um estagiário mal-intencionado) basta — não requer privilégio elevado.

**Correção:** aplicar `checkQuota()` antes do envio e impor um limite de reenvios por (usuário, notificação, dia):

```ts
// após o SELECT do original, antes do INSERT do reenvio:
const quota = await checkQuota(supabaseAdmin)
if (quota.estourou) {
  return json({ ok: false, error: 'quota diária de e-mail atingida' }, 429)
}

// rate limit por usuário/dia
const hoje = new Date().toISOString().slice(0, 10)
const { count } = await supabaseAdmin
  .from('notificacoes_envios')
  .select('id', { count: 'exact', head: true })
  .eq('reenviado_por_id', user.id)
  .gte('reenviado_em', `${hoje}T00:00:00Z`)

if ((count ?? 0) >= 20) {
  return json({ ok: false, error: 'limite de reenvios diários atingido' }, 429)
}
```

Considere também um índice UNIQUE parcial em `(id_original, reenviado_por_id, dia)` para tornar o cooldown estrutural.

---

### WR-02: Idempotência "poison row" — falha transitória suprime a notificação permanentemente

**Arquivos:** `notify-renovacao/index.ts:191-228`, `notify-indicacao/index.ts:308-344`

Ambas inserem a linha de idempotência **antes** de fazer o trabalho:

```ts
const { error: insertErr } = await supabase
  .from('notificacoes_renovacao_enviadas')
  .insert({ contrato_id, dias_antes, status: 'pendente' })
if (insertErr) {
  if (/duplicate key|unique/i.test(insertErr.message)) {
    return json({ ok: true, skipped: 'já notificado (idempotência)' })  // ← bloqueia retry
  }
  ...
}
// ...só agora hidrata o contrato e posta no Slack — se isso falhar, a linha fica lá.
```

Se o Slack estiver fora do ar (`postToSlack` retorna `ok:false` após 3 tentativas) ou a função sofrer timeout/crash, a linha permanece com `status='pendente'`/`'erro'` — e **toda tentativa futura** (o cron do dia seguinte, ou um retry manual) bate no UNIQUE e retorna `skipped: 'já notificado'`. A notificação de renovação daquele contrato **nunca mais será enviada**. Para um CRM cujo valor é justamente "não esquecer a renovação", isso é perda de receita silenciosa. `notify-renovacao` agrava: não há `try/catch` em volta de `hydrateContrato`/`postToSlack`, então uma exceção deixa a linha `'pendente'` para sempre.

**Correção:** o retry deve poder reivindicar linhas não-terminais. Fazer o `insert` tolerar conflito e checar o status atual:

```ts
const { data: existing } = await supabase
  .from('notificacoes_renovacao_enviadas')
  .select('status')
  .eq('contrato_id', payload.contrato_id)
  .eq('dias_antes', payload.dias_antes)
  .maybeSingle<{ status: string }>()

if (existing?.status === 'enviado') {
  return json({ ok: true, skipped: 'já notificado (idempotência)' })
}
if (!existing) {
  const { error: insertErr } = await supabase
    .from('notificacoes_renovacao_enviadas')
    .insert({ contrato_id: payload.contrato_id, dias_antes: payload.dias_antes, status: 'pendente' })
  if (insertErr && !/duplicate key|unique/i.test(insertErr.message)) {
    return json({ ok: false, error: `insert falhou: ${insertErr.message}` }, 500)
  }
}
// 'pendente' | 'erro' → segue e tenta de novo (o UPDATE final é idempotente)
```

Envolver todo o corpo do handler em `try/catch` que marque `status='erro'` (como `notify-indicacao` já faz) para que a linha nunca fique presa em `'pendente'`.

---

### WR-03: `deepLink` interpolado sem escape dentro de atributo `href`

**Arquivos:** `_shared/templates/render.ts:36,53,72,91`; `_shared/templates/tarefa.html.ts:42`; construção do link em `notify-tarefa/index.ts:212-215`

`render.ts` escapa todo texto, mas passa `deepLink` cru — justificado por `:7-9` ("não é input do usuário"). Essa premissa é falsa em `notify-tarefa`:

```ts
const link = tarefa.entidade_tipo && tarefa.entidade_id
  ? `${APP_URL}/${tarefa.entidade_tipo === 'lead' ? 'leads' : tarefa.entidade_tipo === 'cliente' ? 'clientes' : tarefa.entidade_tipo}/${tarefa.entidade_id}`
  : `${APP_URL}/tarefas?highlight=${tarefa.id}`
```

O fallback da ternária usa **`tarefa.entidade_tipo` cru** (sem allowlist), e o valor vem do `record` do webhook. O template insere isso em `<a href="{{deepLink}}" ...>` (`tarefa.html.ts:42`). Com CR-01 ativo (payload forjado), `entidade_tipo = 'x" onmouseover="alert(1)" data-x="'` quebra o atributo. Mesmo sem CR-01, um valor inesperado em `entidade_tipo` gera link inerte.

**Correção:** allowlist na origem + `encodeURI` na borda.

```ts
const ROTA_POR_ENTIDADE: Record<string, string> = {
  lead: 'leads', cliente: 'clientes', contrato: 'contratos', tarefa: 'tarefas',
}
const rota = tarefa.entidade_tipo ? ROTA_POR_ENTIDADE[tarefa.entidade_tipo] : undefined
const link = rota && tarefa.entidade_id
  ? `${APP_URL}/${rota}/${encodeURIComponent(tarefa.entidade_id)}`
  : `${APP_URL}/tarefas?highlight=${encodeURIComponent(tarefa.id)}`
```

E em `render.ts`, aplicar `encodeURI(vars.deepLink)` (preserva query strings, neutraliza `"` → `%22`).

---

### WR-04: Slack mrkdwn injection a partir de campos preenchidos pelo cliente

**Arquivo:** `notify-indicacao/slack.ts:29-32,36,42-51,60,87,97`

`buildIndicacaoBlocks` interpola `indicado_nome`, `indicado_empresa`, `indicado_telefone`, `indicado_email`, `segmento`, `notas` e `indicante_*` diretamente em blocos `mrkdwn`. Esses campos vêm do **formulário público de indicação do Portal** — texto livre de terceiro não confiável.

**Exploração:** um cliente do portal (ou quem alcançar o formulário de indicação) submete uma indicação com `indicado_nome`:

```
ACME Ltda <https://drive-consej.evil.tld/contrato.pdf|— contrato anexo, revisar hoje>
```

O bot posta no canal interno `#leads` uma mensagem com link clicável para o domínio do atacante, dentro de um card que o time trata como confiável. `notas` (`:97`) é ainda mais permissivo — multi-linha, em blockquote.

**Correção:** sanitizar todo texto vindo de terceiros antes de entrar em mrkdwn. Slack só forma link com `<...>`, então remover os delimitadores basta:

```ts
// notify-indicacao/slack.ts
function mrkdwn(s: string | null | undefined, max = 200): string {
  if (!s) return '—'
  return s
    .replace(/[<>]/g, '')          // mata a sintaxe de link <url|texto>
    .replace(/[*_~`]/g, '')        // mata formatação injetada
    .slice(0, max)
}
```

Aplicar em todos os campos derivados de `ind.*` (`indicado_nome`, `indicado_empresa`, `segmento`, `notas`, `indicante_*`). O mesmo tratamento vale para `leads_cadencia[].nome` em `notify-resumo-diario/index.ts:54` e para `titulo`/`descricao` em `notify-tarefa/index.ts:278`.

---

### WR-05: `.ilike('id::text', ...)` — filtro PostgREST inválido e wildcards controlados pelo usuário

**Arquivo:** `slack-commands/index.ts:145-155`

```ts
const { data } = await supabase.from('leads')
  .select('id, status, responsavel_id, nome')
  .ilike('id::text', `${idOrPrefix}%`)   // ← "id::text" não é uma coluna
  .limit(2)
```

PostgREST não aceita cast no lado da coluna em filtros horizontais — `id::text` é interpretado como nome de coluna e a query erra (coluna inexistente). Como o `error` é descartado (só `data` é desestruturado), a busca por prefixo **sempre retorna `null`** e o comando responde "Lead não encontrado", silenciosamente. O caminho de UUID completo (`:137-143`) funciona; o de prefixo — que é o documentado no `/lead help` (`:79`, `/lead status a1b2c3d4 proposta`) — está morto.

Além disso, `idOrPrefix` entra cru no padrão do `ILIKE`: um `%` enviado pelo usuário casa com qualquer lead, e com `.limit(2)` + checagem de ambiguidade o resultado é não-determinístico (embora a checagem de permissão em `:244-249` ainda proteja contra escrita indevida).

**Correção:** filtrar via RPC ou coluna dedicada. O caminho mais simples é uma RPC `SECURITY DEFINER`:

```sql
create or replace function public.buscar_lead_por_prefixo(p_prefix text)
returns table (id uuid, status text, responsavel_id uuid, nome text)
language sql stable as $$
  select l.id, l.status, l.responsavel_id, l.nome
  from public.leads l
  where l.id::text like p_prefix || '%'
  limit 2;
$$;
```

```ts
// escapar wildcards do usuário antes de passar
const safe = idOrPrefix.replace(/[%_\\]/g, '\\$&')
const { data, error } = await supabase.rpc('buscar_lead_por_prefixo', { p_prefix: safe })
if (error) return null
if (!data || data.length !== 1) return null
return data[0]
```

E **checar o `error`** — o descarte do erro é o que transformou um bug em falha silenciosa.

---

### WR-06: CORS `*` em endpoint autenticado que muta estado e dispara e-mail

**Arquivo:** `reenviar-notificacao/index.ts:51-55`

```ts
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
```

O impacto direto é limitado (a auth é por header `Authorization`, não por cookie — o browser não anexa o JWT automaticamente cross-origin, então não há CSRF clássico). Mas é uma exceção gratuita ao padrão: `slack-proxy` já implementa a allowlist correta. Qualquer página maliciosa que consiga extrair o JWT (via XSS no app, extensão, etc.) passa a poder invocar o endpoint direto do browser da vítima. `notify-aprovacao-evento:50` e `notify-aprovacoes-stale:39` também usam `*`, mas ali é menos relevante (chamadas server-to-server via `pg_net`, que ignora CORS — o header sequer é necessário).

**Correção:** reusar o padrão de `slack-proxy/index.ts:9-23` (allowlist `APP_URL` + localhost, com `Vary: Origin`). Nas duas funções de aprovação, **remover** os headers CORS: `pg_net` não é um browser e não os usa.

---

### WR-07: `smoke-push` — endpoint de diagnóstico público em produção

**Arquivo:** `smoke-push/index.ts:52-123` (deploy `--no-verify-jwt`, `:22`)

Aceito formalmente em `06-SECURITY.md:35` (T-06-05) com a justificativa de que só retorna tamanhos de chave, não valores. **Confirmo que isso é verdade**: `public_key_length`/`private_key_length` são `.length` (`:96-99`), nunca os valores. Não há mutação nem PII.

Ainda assim: o endpoint é anônimo, executa `generateVAPIDKeys()` (ECDH P-256) a cada request — CPU grátis para qualquer um, sem rate limit — e revela se as VAPID keys estão configuradas (`:82`), útil para reconhecimento. A justificativa do aceite ("redeploy on-demand se web-push falhar", `:17-19`) é exatamente o argumento para **não** mantê-lo deployado.

**Correção:** deletar da produção (`supabase functions delete smoke-push`), mantendo o arquivo no repo para redeploy sob demanda. Se precisar permanecer, exigir o header de secret via `requireWebhookAuth` (o mesmo helper de CR-01).

---

### WR-08: Qualquer membro do workspace Slack cria lead, mesmo sem perfil no CRM

**Arquivo:** `slack-commands/index.ts:186-221`

`handleNewLead` chama `findInternoBySlackUser` (`:190`) mas **não exige** o resultado — se o Slack user não estiver mapeado em `perfis.slack_user_id`, o lead é criado assim mesmo com `responsavel_id: null` (`:201`). Compare com `handleStatusUpdate:229-232`, que corretamente aborta quando `interno` é null.

A assinatura do Slack garante que o request vem do workspace, mas o workspace pode ter convidados/single-channel guests/contas de estagiário sem perfil no CRM. Um lead órfão (`responsavel_id: null`) também aciona o fallback de e-mail para **todos os diretores** (`_shared/perfis.ts:76`), transformando escrita não autorizada em spam para a liderança.

**Correção:** aplicar a mesma regra do `status`:

```ts
const interno = await findInternoBySlackUser(slackUserId)
if (!interno) {
  return ephemeral('❌ Seu usuário Slack não está mapeado a um perfil interno no CRM. Peça à diretoria pra preencher `perfis.slack_user_id`.')
}
```

Adicionalmente: `parseNewLead` (`:176-184`) não limita o tamanho de `nome`/`empresa`/`telefone` — impor `.slice(0, 120)` antes do INSERT.

---

### WR-09: `deepLink` de documentos quebrado — `${''}` morto na template string

**Arquivo:** `_shared/aprovacoes.ts:130`

```ts
const deepLink = `${APP_URL}/clientes/${''}docs?doc=${p.docId}` // genérico; UI resolve cliente_id no Slice 3
```

O `${''}` é vestígio de uma interpolação de `cliente_id` removida. O resultado é `https://app/clientes/docs?doc=<uuid>` — rota que não existe (o padrão do app é `/clientes/:id`). Todos os CTAs de notificação de documento (e-mail `:105`, Slack `:152`, push `:180`) apontam para uma página quebrada. Não é vulnerabilidade, mas quebra a funcionalidade central da Phase 7 — o consultor não consegue chegar ao documento a partir da notificação.

**Correção:** o `cliente_id` já chega no payload (`notify-aprovacao-evento/index.ts:31`) mas nunca é repassado ao helper. Propagar:

```ts
// SendNotificacaoAprovacaoParams
clienteId: string

// e o link:
const deepLink = `${APP_URL}/clientes/${p.clienteId}?tab=docs&doc=${p.docId}`
```

Em `notify-aprovacoes-stale`, o `cliente_id` também já vem no `StalePayload:22` e é ignorado — passar adiante.

---

### WR-10: `resend-webhook` sem dedup de `svix-id` — replay dentro da janela de 5 min

**Arquivo:** `resend-webhook/index.ts:55-80`

A assinatura e a janela de replay estão corretas, mas não há registro de `svix-id` já processados (`:12` assume que "o UPDATE natural é idempotente"). Um atacante em posição de capturar um webhook válido (ou o próprio Resend, em retry duplicado) pode reenviá-lo N vezes dentro de 5 minutos. Como o `UPDATE` é de fato idempotente por campo, o impacto real é baixo — mas `updates.error_msg` (`:114`) e os `*_at` são sobrescritos, e o `STATUS_RANK` não impede reescrever `bounced_at` repetidamente.

**Correção (defesa em profundidade):** tabela `webhook_events_processados (svix_id text primary key, processado_em timestamptz default now())` + INSERT antes do processamento; conflito `23505` → `return json({ ok: true, skipped: 'replay' })`. Limpeza por cron (>7 dias).

---

## INFO

### IN-01: Confirmação — a afirmação R6 de `_shared/email.ts:18` é **verdadeira**

`_shared/email.ts:18` afirma: *"Segurança: RESEND_API_KEY nunca aparece em error_msg ou logs (R6)"*. **Verifiquei e confirmo.** `lastErr` só recebe: (a) `e.message` de exceção do `fetch` (`:180`), (b) `HTTP ${res.status}` (`:186`, `:207`), (c) `body.message` da resposta do Resend (`:207`). A chave só é usada no header `Authorization` (`:168`) e nunca é interpolada em string persistida ou logada. Não há `console.log` da chave em nenhuma das 25 funções.

O mesmo vale para as afirmações equivalentes em `_shared/push.ts:18` (`VAPID_PRIVATE_KEY`) — os erros agregados (`:207-211`) só contêm `statusCode`/`message` da lib e um `sub.id.slice(0,8)` — e em `_shared/aprovacoes.ts:24-25` (`WEBHOOK_APROVACAO_SECRET` nunca aparece em erro). Confirmados.

Ressalva: `reenviar-notificacao/index.ts:243` devolve `lastErr` (mensagem crua da API do Resend) ao cliente no corpo da resposta. Hoje é benigno, mas é o único ponto onde um erro upstream vaza para o browser — preferir uma mensagem genérica e logar o detalhe no servidor.

### IN-02: `constantTimeAuthCheck` vaza o comprimento do secret

`_shared/auth.ts:17-21`: o `if (got.length !== expected.length)` retorna cedo. O `timingSafeEqual(expected, expected)` no ramo de erro é um gesto simpático, mas o retorno antecipado já revela, por timing, o tamanho do valor esperado. É a limitação padrão dessa construção (o mesmo vale para `slack-commands:94-99` e `verify.ts:63-67`) e o impacto prático é desprezível para um secret de alta entropia. Registrado para completude. Solução canônica, se quiser eliminar: comparar o HMAC-SHA256 dos dois valores (comprimento fixo) em vez dos valores crus.

### IN-03: `resend-webhook` — código inalcançável e `delivered_at` escrito em regressão de status

`resend-webhook/index.ts:149-151`: a checagem `if (Object.keys(updates).length === 0)` é **inalcançável** — todo caminho que chega ali já populou pelo menos um `*_at` (`:105`, `:109`, `:113`, `:118`). O próprio comentário admite (`:147-148`). Efeito colateral: quando o rank impede a regressão de status (ex.: `delivered` chegando depois de `opened`), o `UPDATE` ainda escreve `delivered_at` — o que é aceitável, mas significa que a mensagem `'status regress prevented'` nunca é retornada e o observability prometido não existe. Além disso, `bounced`/`complained`/`failed` compartilham rank 99 (`:34-37`), então `newRank > currentRank` é falso entre eles — um `complained` após um `bounced` não atualiza o status (provavelmente o desejado, mas não documentado).

Correção: mover a decisão de escrita para depois do cálculo de rank e retornar cedo quando o status não avança, ou remover a checagem morta e documentar que os `*_at` são sempre gravados.

---

## Ordem de correção recomendada

1. **CR-01** — auditar os secrets em produção **hoje** (`supabase secrets list`); se algum `WEBHOOK_*_SECRET` estiver faltando, há uma função service-role aberta na internet **neste momento**. Depois, aplicar o `requireWebhookAuth` fail-closed nas 6 funções.
2. **CR-02** — escapar `plain` em `aprovacoes.ts`; um cliente do portal consegue phishing por e-mail contra a equipe interna hoje.
3. **WR-01** — quota + rate limit no `reenviar-notificacao` (um consultor derruba todo o e-mail do CRM com um loop).
4. **WR-04 / WR-03** — sanitizar mrkdwn e allowlist do `entidade_tipo` (mesma classe de CR-02, superfície menor).
5. **WR-02 / WR-09 / WR-05** — bugs de correção que quebram funcionalidade (renovação perdida, link morto, busca por prefixo inoperante).
6. **WR-06 / WR-07 / WR-08 / WR-10** — endurecimento.

---

_Auditado: 2026-07-13_
_Revisor: Claude (gsd-code-reviewer) — stance adversarial_
_Escopo: 25 arquivos, `supabase/functions/**/*.ts`_

// Shared helper: Slack DM (openDmChannel + postDm) extraído de notify-tarefa
// (Plan 5-01 manteve inline; Plan 5-02 extrai porque 2+ funções vão usar).
//
// Divergência crítica do original (PATTERNS §_shared/slack.ts):
//   - `token` é PARÂMETRO explícito, não closure sobre Deno.env.get('SLACK_BOT_TOKEN')
//   - mantém o helper portável (caller controla qual token usar)
//
// Retry exponencial 3x (500 * 2^i ms) para 429/5xx — idêntico ao original.
//
// @ts-nocheck (URL imports não resolvem no TS Node — Deno runtime resolve em prod)

export interface OpenDmResult {
  ok: boolean
  channel?: string
  error?: string
}

export interface PostDmResult {
  ok: boolean
  ts?: string
  error?: string
}

/**
 * Abre (ou recupera) o canal de DM com o usuário. Padrão recomendado pelo Slack
 * — postar direto no U... pode falhar silenciosamente.
 */
export async function openDmChannel(
  token: string,
  slackUserId: string,
): Promise<OpenDmResult> {
  const res = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ users: slackUserId }),
  })
  const body = (await res.json()) as { ok: boolean; channel?: { id: string }; error?: string }
  if (!body.ok || !body.channel) return { ok: false, error: body.error ?? `HTTP ${res.status}` }
  return { ok: true, channel: body.channel.id }
}

/**
 * Resolve canal de DM e posta uma mensagem com retry exponencial.
 * Retorna { ok, ts? } em sucesso ou { ok:false, error } após 3 tentativas.
 */
export async function postDm(
  token: string,
  slackUserId: string,
  text: string,
  blocks: unknown[],
): Promise<PostDmResult> {
  const dm = await openDmChannel(token, slackUserId)
  if (!dm.ok || !dm.channel) {
    return { ok: false, error: `conversations.open falhou: ${dm.error}` }
  }
  for (let i = 0; i < 3; i++) {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: dm.channel, text, blocks, unfurl_links: false }),
    })
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** i))
      continue
    }
    const body = (await res.json()) as { ok: boolean; ts?: string; error?: string }
    return body.ok ? { ok: true, ts: body.ts } : { ok: false, error: body.error ?? `HTTP ${res.status}` }
  }
  return { ok: false, error: 'Slack indisponível após retries' }
}

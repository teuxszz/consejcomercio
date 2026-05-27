// Template HTML PT-BR para nova indicação recebida.
//
// Placeholders (substituídos por renderIndicacao em render.ts):
//   {{nomeResponsavel}}      — escape HTML
//   {{nomeIndicante}}        — escape HTML
//   {{nomeIndicado}}         — escape HTML
//   {{segmento}}             — escape HTML
//   {{deepLink}}             — URL literal (não escapar)
//   {{gerenciarPrefsLink}}   — URL literal (não escapar)
//
// Layout consistente com tarefa.html.ts / cadencia.html.ts / renovacao.html.ts.

const indicacaoTemplate = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Nova indicação — CONSEJ</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <tr>
            <td style="background:#0089ac;padding:20px 32px;color:#ffffff;font-size:18px;font-weight:600;">
              CONSEJ
            </td>
          </tr>

          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.4;color:#1a1a1a;">
                Olá, {{nomeResponsavel}} — nova indicação
              </h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#3a3a3a;">
                <strong>{{nomeIndicante}}</strong> indicou <strong>{{nomeIndicado}}</strong>.
              </p>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#6a6a6a;">
                Segmento: <strong>{{segmento}}</strong>. Faça o primeiro contato antes que esfrie.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#0089ac;border-radius:6px;">
                    <a href="{{deepLink}}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
                      Abrir lead
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #ececec;font-size:12px;color:#777777;line-height:1.6;">
              <p style="margin:0 0 8px 0;">
                <a href="{{gerenciarPrefsLink}}" style="color:#0089ac;text-decoration:none;">Gerenciar preferências</a>
              </p>
              <p style="margin:0;">
                CONSEJ — Empresa Júnior de Consultoria Jurídica
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

export default indicacaoTemplate

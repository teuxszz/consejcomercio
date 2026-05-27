// Template HTML PT-BR para notificação de tarefa atribuída.
//
// Placeholders (substituídos por renderTarefa em render.ts):
//   {{nomeAtribuido}}     — escape HTML
//   {{tituloTarefa}}      — escape HTML
//   {{deepLink}}          — URL literal (não escapar)
//   {{gerenciarPrefsLink}}— URL literal (não escapar)
//
// Inline CSS apenas (compat de clientes de e-mail). Cor primary do CRM
// (#0089ac — espelhada do PortalLayout para manter coerência visual).

const tarefaTemplate = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Nova tarefa — CONSEJ</title>
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
                Olá, {{nomeAtribuido}}, nova tarefa atribuída
              </h1>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#3a3a3a;">
                {{tituloTarefa}}
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#0089ac;border-radius:6px;">
                    <a href="{{deepLink}}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
                      Abrir no CRM
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

export default tarefaTemplate

// Alertas operacionais ao Afonso (C2, A3, A4, M7): e-mail para ALERT_EMAIL ou,
// na falta dele, EMAIL_REPLY_TO. Nunca lança: um alerta que falha fica no log.

import { enviarEmail, esc, molde } from "./email.ts";
import { semSegredos } from "./log.ts";

export function destinoAlertas(): string {
  return (Deno.env.get("ALERT_EMAIL") ?? Deno.env.get("EMAIL_REPLY_TO") ?? "").trim();
}

export async function alertar(assunto: string, linhas: string[]): Promise<boolean> {
  const to = destinoAlertas();
  const texto = linhas.join("\n");
  if (!to) { console.error(`ALERTA sem destinatário (define ALERT_EMAIL): ${assunto}`); return false; }
  try {
    await enviarEmail({
      to,
      subject: `[ProvenDrop] ${assunto}`,
      text: texto,
      html: molde(assunto, linhas.map((l) => `<p style="margin:0 0 10px">${esc(l)}</p>`).join("")),
    });
    return true;
  } catch (e) {
    console.error(`ALERTA não enviado (${assunto}): ${semSegredos((e as Error).message)}`);
    return false;
  }
}

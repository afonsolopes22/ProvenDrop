// Envio de e-mail pela API do Resend (https://resend.com/docs/api-reference).
// Segredos: RESEND_API_KEY, EMAIL_FROM (ex.: "ProvenDrop <noreply@provendrop.pt>"),
// EMAIL_REPLY_TO (opcional). Nunca são escritos nos logs.

export interface Mensagem {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const API = "https://api.resend.com/emails";

function cabecalhos(): HeadersInit {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY em falta");
  return { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
}

function corpo(m: Mensagem) {
  const from = Deno.env.get("EMAIL_FROM");
  if (!from) throw new Error("EMAIL_FROM em falta");
  const replyTo = Deno.env.get("EMAIL_REPLY_TO");
  return { from, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(replyTo ? { reply_to: replyTo } : {}) };
}

async function verificar(r: Response, contexto: string) {
  if (r.ok) return;
  const t = await r.text().catch(() => "");
  throw new Error(`${contexto}: Resend ${r.status} ${t.slice(0, 300)}`);
}

/** Envia uma mensagem. */
export async function enviarEmail(m: Mensagem): Promise<void> {
  const r = await fetch(API, { method: "POST", headers: cabecalhos(), body: JSON.stringify(corpo(m)) });
  await verificar(r, `e-mail para ${m.to}`);
}

/** Envia várias mensagens, em lotes de 100 (limite do endpoint /emails/batch). Devolve quantas foram aceites. */
export async function enviarEmails(ms: Mensagem[]): Promise<number> {
  let enviados = 0;
  for (let i = 0; i < ms.length; i += 100) {
    const lote = ms.slice(i, i + 100);
    const r = await fetch(`${API}/batch`, { method: "POST", headers: cabecalhos(), body: JSON.stringify(lote.map(corpo)) });
    await verificar(r, `lote ${i / 100 + 1}`);
    enviados += lote.length;
  }
  return enviados;
}

/** Escapa texto para HTML. */
export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Molde HTML simples e legível em qualquer cliente de e-mail. */
export function molde(titulo: string, corpoHtml: string, botao?: { texto: string; url: string }, rodape?: string): string {
  const b = botao
    ? `<p style="margin:28px 0"><a href="${esc(botao.url)}" style="display:inline-block;background:#78C995;color:#101310;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px">${esc(botao.texto)}</a></p>`
    : "";
  return `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#F7F8F6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#171A18">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <p style="font-weight:700;font-size:18px;margin:0 0 24px">ProvenDrop</p>
  <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;font-weight:600">${esc(titulo)}</h1>
  <div style="font-size:16px;line-height:1.55">${corpoHtml}</div>
  ${b}
  ${rodape ? `<p style="font-size:13px;color:#5C645E;line-height:1.5;margin-top:32px;border-top:1px solid #E6E9E5;padding-top:16px">${rodape}</p>` : ""}
</div></body></html>`;
}

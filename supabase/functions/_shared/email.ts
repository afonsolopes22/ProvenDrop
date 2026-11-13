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
  await verificar(r, "e-mail"); // B5: sem o endereço do destinatário na mensagem de erro
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

/** Base pública do site (pasta de APP_URL), para o logo dos e-mails (PNG: os clientes de e-mail não mostram SVG).
 *  O logo é o apple-touch-icon.png da raiz do site (180×180, cores novas, publicado desde 2026-11-10). */
function baseSite(): string {
  const app = Deno.env.get("APP_URL") ?? "https://provendrop.com/app.html";
  return app.replace(/[^/]*$/, "");
}

/** Molde HTML simples e legível em qualquer cliente de e-mail. Logótipo nas cores do site desde 2026-11-10
 *  (PNG apple-touch-icon.png: quadrado #12301F, barras #D4F57A, ponto #3FB06A; "Drop" #1F6B42). Botão como os do site: #12301F com texto #D4F57A. */
/** Botão dos e-mails (verde-escuro com texto lima, como .btn-d no site). `margem` é o margin do parágrafo que o envolve. */
export function botaoHtml(botao: { texto: string; url: string }, margem = "28px 0"): string {
  return `<p style="margin:${margem}"><a href="${esc(botao.url)}" style="display:inline-block;background:#12301F;color:#D4F57A;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${esc(botao.texto)}</a></p>`;
}

export function molde(titulo: string, corpoHtml: string, botao?: { texto: string; url: string }, rodape?: string): string {
  const b = botao ? botaoHtml(botao) : "";
  return `<!doctype html><html lang="en"><body style="margin:0;background:#F4F7F6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0E1A17">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr>
    <td style="padding:0 10px 0 0;vertical-align:middle"><img src="${esc(baseSite())}apple-touch-icon.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px"></td>
    <td style="vertical-align:middle;font-weight:800;font-size:19px;letter-spacing:-0.01em"><span style="color:#0B1F1E">Proven</span><span style="color:#1F6B42">Drop</span></td>
  </tr></table>
  <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;font-weight:700">${esc(titulo)}</h1>
  <div style="font-size:16px;line-height:1.55">${corpoHtml}</div>
  ${b}
  ${rodape ? `<p style="font-size:13px;color:#5B6B66;line-height:1.5;margin-top:32px;border-top:1px solid #E2E8E6;padding-top:16px">${rodape}</p>` : ""}
</div></body></html>`;
}

// ── Moldes do plano Click (admin-click, 2026-11-08) ─────────────────────────
// Devolvem assunto, HTML e texto; o destinatário é posto por quem envia.

/**
 * Boas-vindas a um cliente Click com acesso (validado automaticamente na compra, ou à mão em admin.html): o mesmo molde e o mesmo
 * botão de entrada por token_hash das boas-vindas do webhook, com o remate adaptado (a lista
 * diária chega no grupo de WhatsApp da Click; a área tem tudo isso e mais).
 */
export function moldeBoasVindasClick(link: string, minutos: string): Omit<Mensagem, "to"> {
  const text =
    `Hi! Your ProvenDrop × Click access is active.\n\n` +
    `Sign in to your member area with this link (it is personal and valid for ${minutos} minutes):\n${link}\n\n` +
    `Everything you get in the Click WhatsApp group is here too, plus all past collections, the launch kits and filters.\n\n` +
    `Any question, reply to this e-mail.`;
  const html = molde(
    "Your access is active",
    `<p>Hi! Your ProvenDrop × Click access is active.</p>
     <p>Sign in to your member area with this button (the link is personal and valid for ${esc(minutos)} minutes):</p>`,
    { texto: "Sign in to ProvenDrop", url: link },
    `Everything you get in the Click WhatsApp group is here too, plus all past collections, the launch kits and filters. Any question, reply to this e-mail.`,
  );
  return { subject: "Welcome to ProvenDrop: your access", html, text };
}

/**
 * Cliente Click recusado (a Click não o confirmou como cliente): reembolso total feito,
 * subscrição cancelada; convite para o plano Platform. `texto` é a frase exata do plano
 * (acoes.ts), `url` o site.
 */
export function moldeRecusaClick(assunto: string, texto: string, url: string): Omit<Mensagem, "to"> {
  const html = molde(assunto, `<p>${esc(texto)}</p>`, { texto: "See the ProvenDrop Platform plan", url });
  return { subject: assunto, html, text: `${texto}\n\n${url}` };
}

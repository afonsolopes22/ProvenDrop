// corrigir-email · Correção do e-mail errado no checkout Direct (2026-11-06, docs/EMAIL.md §7).
//
//   GET  ?session_id=cs_…                          → { email: "afo•••@gmail.com", corrigido: false }
//                                                    (só o e-mail MASCARADO; nunca o inteiro nem outros dados)
//   POST { session_id, novo_email, confirmacao }   → { ok: true, email: "<novo, mascarado>", enviado: true|false }
//
// Regras (validar.ts, testadas em validar.test.ts): sessão paga, criada há < 24 h, porta Direct, com
// e-mail; uma correção por sessão (subscritores.email_corrigido_sessao + correcoes_email); e-mail novo
// válido, diferente do atual e igual à confirmação; e-mail novo sem outro subscritor nem outro login.
//
// Efeitos do POST, por esta ordem (e o que se desfaz se algo falhar a meio):
//   1. utilizador de Auth (se existir): e-mail novo, confirmado — conflito → 422, nada mudou;
//   2. Stripe: customer.email = novo (os recibos e o portal passam a usar o novo);
//   3. base: corrigir_email_subscritor() troca o e-mail em subscricoes e subscritores e regista a
//      auditoria (correcoes_email), numa única transação — se falhar, 1 e 2 são revertidos;
//   4. magic link por token_hash enviado ao e-mail novo (Resend); se o envio falhar, a correção
//      fica feita e a resposta diz enviado:false (o cliente pede o link na página de entrada);
//   5. alerta ao Afonso (sem e-mails: só os hashes).
//
// Rate-limit por IP (hash SHA-256, nunca o IP): 20 GET / 5 POST por 10 min (registar_pedido_correcao).
// CORS: só a origem de APP_URL (GitHub Pages / domínio) e localhost para testes.
// Deploy:  supabase functions deploy corrigir-email --no-verify-jwt
// Segredos (os mesmos do stripe-webhook): STRIPE_SECRET_KEY, STRIPE_PRICE_DIRETO, STRIPE_PRICE_CLICK,
//   RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, ALERT_EMAIL, APP_URL, MAGIC_LINK_MINUTOS, HORA_ENVIO.
// Logs sem e-mails ("u:<hash>") nem erros internos (B5/S13).

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { enviarEmail, esc, molde } from "../_shared/email.ts";
import { idEmail, semSegredos } from "../_shared/log.ts";
import { alertar } from "../_shared/alerta.ts";
import {
  JANELA_MIN, LIMITE_GET, LIMITE_POST, mascarar, podeCorrigir, respostaDeMotivo, sessaoValida, validarNovoEmail, validarSessao,
  type Motivo, type Recusa, type SessaoOk,
} from "./validar.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-02-24.acacia", // versão do SDK stripe@17.7.0; os objetos são lidos nas duas formas (compat.ts)
  httpClient: Stripe.createFetchHttpClient(),
});
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const APP_URL = Deno.env.get("APP_URL") ?? "https://afonsolopes22.github.io/ProvenDrop/app.html";
const PRICE_DIRETO = Deno.env.get("STRIPE_PRICE_DIRETO") ?? "";
const PRICE_CLICK = Deno.env.get("STRIPE_PRICE_CLICK") ?? "";
const MINUTOS = Deno.env.get("MAGIC_LINK_MINUTOS") ?? "60";

function horaTexto(): string {
  const h = (Deno.env.get("HORA_ENVIO") ?? "").trim();
  const m = h.match(/^(\d{1,2})(?::(\d{2}))?$/);
  return m ? `${m[1].padStart(2, "0")}:${m[2] ?? "00"}` : "[HOUR]";
}
const HORA = horaTexto();

/** CORS: só a origem do site (APP_URL) e localhost. Outras origens não recebem o cabeçalho (o browser bloqueia a leitura). */
function cors(req: Request): Record<string, string> {
  const origem = req.headers.get("origin") ?? "";
  let ok = false;
  try {
    const o = new URL(origem), app = new URL(APP_URL);
    const local = o.hostname === "localhost" || o.hostname === "127.0.0.1" || o.hostname === "[::1]" || o.hostname.endsWith(".localhost");
    ok = o.origin === app.origin || local;
  } catch { ok = false; }
  return ok
    ? { "Access-Control-Allow-Origin": origem, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "600", "Vary": "Origin" }
    : { "Vary": "Origin" };
}

const json = (req: Request, b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) } });
const recusar = (req: Request, motivo: Motivo) => { const r = respostaDeMotivo(motivo); return json(req, { erro: r.erro }, r.status); };
const erroInterno = (req: Request) => json(req, { erro: "erro interno" }, 500);

/** SHA-256 do IP do pedido (nunca o IP): chave do rate-limit e campo da auditoria. */
async function hashIp(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "desconhecido";
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)));
  return Array.from(h).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** true = pode continuar (e o pedido fica registado); false = limite atingido. */
async function dentroDoLimite(ipHash: string, limite: number): Promise<boolean> {
  const r = await admin.rpc("registar_pedido_correcao", { p_ip_hash: ipHash, p_limite: limite, p_minutos: JANELA_MIN });
  if (r.error) throw r.error;
  return r.data === true;
}

/** Lê a sessão no Stripe e aplica validarSessao; só pede as line items quando a metadata não diz a origem. */
async function sessaoDoStripe(sid: string): Promise<SessaoOk | Recusa> {
  let s: Stripe.Checkout.Session;
  try {
    s = await stripe.checkout.sessions.retrieve(sid, { expand: ["customer"] });
  } catch (e) {
    const err = e as { statusCode?: number; code?: string; message?: string };
    if (err.statusCode === 404 || err.code === "resource_missing" || /No such checkout\.session/i.test(err.message ?? "")) return { ok: false, motivo: "nao_paga" };
    throw e;
  }
  let v = validarSessao(s, [], PRICE_DIRETO, PRICE_CLICK);
  if (!v.ok && v.motivo === "nao_direto") {
    const linhas = await stripe.checkout.sessions.listLineItems(sid, { limit: 20 });
    v = validarSessao(s, linhas.data, PRICE_DIRETO, PRICE_CLICK);
  }
  return v;
}

/** Link de entrada por token_hash (só consumido quando app.html corre verifyOtp), igual ao do stripe-webhook. */
async function linkDeEntrada(email: string): Promise<string> {
  const l = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: APP_URL } });
  if (l.error) throw l.error;
  const th = l.data.properties?.hashed_token;
  if (!th) throw new Error("magic link sem hashed_token");
  return `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}token_hash=${encodeURIComponent(th)}&type=magiclink`;
}

async function enviarAcesso(email: string, link: string) {
  const texto =
    `Hi! Your e-mail was corrected and your access is active.\n\n` +
    `Sign in to your member area with this link (it is personal and valid for ${MINUTOS} minutes):\n${link}\n\n` +
    `From tomorrow, every day at ${HORA} (Lisbon time), you receive here the day's collections.\n\n` +
    `Any question, reply to this e-mail.`;
  const html = molde(
    "Your access is active",
    `<p>Hi! Your e-mail was corrected and your access is active.</p>
     <p>Sign in to your member area with this button (the link is personal and valid for ${esc(MINUTOS)} minutes):</p>`,
    { texto: "Sign in to ProvenDrop", url: link },
    `From tomorrow, every day at ${esc(HORA)} (Lisbon time), you receive here the day's collections. Any question, reply to this e-mail.`,
  );
  await enviarEmail({ to: email, subject: "Welcome to ProvenDrop: your access", html, text: texto });
}

const jaExiste = (m: string) => /already|exists|registered|duplicate/i.test(m);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "GET" && req.method !== "POST") return json(req, { erro: "método não permitido" }, 405);

  try {
    const ip = await hashIp(req);

    // ── GET: e-mail mascarado da sessão ──────────────────────────────────
    if (req.method === "GET") {
      const sid = (new URL(req.url).searchParams.get("session_id") ?? "").trim();
      if (!sessaoValida(sid)) return recusar(req, "nao_paga");
      if (!(await dentroDoLimite(ip, LIMITE_GET))) return json(req, { erro: "limite" }, 429);
      const v = await sessaoDoStripe(sid);
      if (!v.ok) return recusar(req, v.motivo);
      // Já corrigida: mostra o e-mail novo (mascarado) e diz que já não se pode corrigir.
      const c = await admin.from("correcoes_email").select("email_novo").eq("sessao", sid).order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (c.error) throw c.error;
      if (c.data) return json(req, { email: mascarar(c.data.email_novo), corrigido: true });
      return json(req, { email: mascarar(v.email), corrigido: false });
    }

    // ── POST: corrigir ───────────────────────────────────────────────────
    const corpo = await req.json().catch(() => null) as { session_id?: unknown; novo_email?: unknown; confirmacao?: unknown } | null;
    const sid = String(corpo?.session_id ?? "").trim();
    if (!sessaoValida(sid)) return recusar(req, "nao_paga");
    if (!(await dentroDoLimite(ip, LIMITE_POST))) return json(req, { erro: "limite" }, 429);

    const v = await sessaoDoStripe(sid);
    if (!v.ok) return recusar(req, v.motivo);
    const n = validarNovoEmail(v.email, corpo?.novo_email, corpo?.confirmacao);
    if (!n.ok) return recusar(req, n.motivo);
    const uidAntigo = await idEmail(v.email), uidNovo = await idEmail(n.novo);

    const s = await admin.from("subscritores").select("email,user_id,email_corrigido_em,email_corrigido_sessao").eq("email", v.email).maybeSingle();
    if (s.error) throw s.error;
    if (!s.data) {
      // O webhook ainda não registou a compra (ou já foi corrigida e o e-mail antigo desapareceu).
      const c = await admin.from("correcoes_email").select("id").eq("sessao", sid).limit(1);
      if (c.error) throw c.error;
      return recusar(req, c.data?.length ? "ja_corrigido" : "ainda_a_registar");
    }
    if (!podeCorrigir(s.data, sid)) return recusar(req, "ja_corrigido");
    const emUso = await admin.from("subscritores").select("email").eq("email", n.novo).maybeSingle();
    if (emUso.error) throw emUso.error;
    if (emUso.data) return recusar(req, "email_em_uso");

    // 1. Auth: o e-mail novo no utilizador existente (conflito com outro login → 422, nada mudou).
    const userId = s.data.user_id as string | null;
    if (userId) {
      const u = await admin.auth.admin.updateUserById(userId, { email: n.novo, email_confirm: true });
      if (u.error) {
        if (jaExiste(u.error.message) || u.error.code === "email_exists") return recusar(req, "email_em_uso");
        throw u.error;
      }
    }

    // 2. Stripe: o cliente passa a ter o e-mail novo (recibos, portal, próximas faturas).
    if (v.customer) await stripe.customers.update(v.customer, { email: n.novo });

    // 3. Base, numa transação: subscricoes + subscritores + auditoria.
    const r = await admin.rpc("corrigir_email_subscritor", { p_antigo: v.email, p_novo: n.novo, p_sessao: sid, p_customer: v.customer, p_ip_hash: ip });
    if (r.error) {
      // Reverter 1 e 2 (melhor esforço) para o Stripe e o login não ficarem com um e-mail que a base não tem.
      try { if (v.customer) await stripe.customers.update(v.customer, { email: v.email }); } catch (e) { console.error("reverter stripe:", semSegredos((e as Error).message)); }
      try { if (userId) await admin.auth.admin.updateUserById(userId, { email: v.email, email_confirm: true }); } catch (e) { console.error("reverter auth:", semSegredos((e as Error).message)); }
      const m = r.error.message ?? "";
      if (/ja_corrigido/.test(m)) return recusar(req, "ja_corrigido");
      if (/email_em_uso/.test(m)) return recusar(req, "email_em_uso");
      if (/mesmo_email/.test(m)) return recusar(req, "mesmo_email");
      if (/subscritor_nao_encontrado/.test(m)) return recusar(req, "ainda_a_registar");
      throw r.error;
    }

    // Sem login ainda (o webhook cria-o quando há acesso): cria-se já com o e-mail novo, para o link funcionar.
    if (!userId) {
      const c = await admin.auth.admin.createUser({ email: n.novo, email_confirm: true });
      if (c.error && !jaExiste(c.error.message) && c.error.code !== "email_exists") throw c.error;
      const id = c.data?.user?.id ?? null;
      if (id) await admin.from("subscritores").update({ user_id: id }).eq("email", n.novo);
    }

    // 4. Magic link para o e-mail novo.
    let enviado = false;
    try {
      await enviarAcesso(n.novo, await linkDeEntrada(n.novo));
      enviado = true;
    } catch (e) {
      console.error(`acesso para ${uidNovo} não enviado: ${semSegredos((e as Error).message)}`);
    }

    // 5. Alerta (só hashes).
    console.log(`e-mail corrigido: ${uidAntigo} → ${uidNovo} (sessão ${sid}, enviado=${enviado})`);
    await alertar("E-mail corrigido no checkout", [
      `Subscritor ${uidAntigo} → ${uidNovo}, sessão ${sid}, cliente ${v.customer ?? "desconhecido"}.`,
      enviado ? "Magic link enviado ao e-mail novo." : "Magic link NÃO enviado (Resend falhou): o cliente foi avisado para pedir o link na página de entrada com o e-mail novo.",
      "Stripe (customer.email), subscricoes, subscritores e o utilizador de Auth já têm o e-mail novo. Auditoria: public.correcoes_email.",
    ]);
    return json(req, { ok: true, email: mascarar(n.novo), enviado });
  } catch (e) {
    console.error(req.method, semSegredos((e as Error).message));
    return erroInterno(req);
  }
});

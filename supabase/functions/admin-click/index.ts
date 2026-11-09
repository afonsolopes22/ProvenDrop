// admin-click · Página de administração do plano Click (admin.html, 2026-11-08):
// lista as compras Click por confirmar e marca cada uma como validada (acesso à
// área + boas-vindas) ou recusada (reembolso total + cancelamento no Stripe +
// e-mail ao cliente).
//
//   POST, cabeçalho Authorization: Bearer <JWT do utilizador>, corpo JSON:
//     {"acao":"listar"}               → [ {email,nome,telefone,loja,codigo_compra,criado_em} ]
//                                       (origem=click, estado_click=pendente, mais recentes primeiro)
//     {"acao":"validar","email":"…"}  → {ok:true, boas_vindas:"enviadas"|"por_enviar"}
//     {"acao":"recusar","email":"…"}  → {ok:true, reembolsado:bool, cancelada:bool, email_enviado:bool}
//
// Autorização: a função valida o JWT ela própria (verify_jwt = false em config.toml)
// com supabase.auth.getUser(jwt) num cliente com a anon key, e só aceita o utilizador
// cujo e-mail (minúsculas) é igual ao secret ADMIN_EMAIL (acoes.ts, autorizar).
//   sem JWT válido → 401 {"erro":"sem_sessao"}; outro e-mail → 403 {"erro":"nao_autorizado"};
//   corpo inválido → 400 {"erro":"corpo_invalido"}.
//
// Idempotência: validar e recusar fazem `update subscritores set estado_click = …
// where email = … and estado_click = 'pendente'`; 0 linhas → 409 {"erro":"nao_pendente"}
// e nada mais acontece (um segundo "Reject & refund" não reembolsa duas vezes).
// Fatura de 0 (cupão TESTE100) → não se chama a Refunds API, só se cancela (acoes.ts,
// decidirReembolso). Se o Stripe falhar depois de a linha já estar 'recusado', o Afonso
// recebe um alerta para terminar à mão e a resposta é 502 {"erro":"stripe_falhou"}.
// Se as boas-vindas falharem, a linha fica 'validado' sem boas_vindas_em e o
// varrimento do stripe-webhook (pg_cron) repete-as.
//
// CORS: a origem de APP_URL, a origem antiga do GitHub Pages e localhost (como corrigir-email).
// Deploy:  supabase functions deploy admin-click --no-verify-jwt
// Segredos: ADMIN_EMAIL, STRIPE_SECRET_KEY, RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO,
//   ALERT_EMAIL, APP_URL, MAGIC_LINK_MINUTOS. SUPABASE_URL, SUPABASE_ANON_KEY e
//   SUPABASE_SERVICE_ROLE_KEY são injetadas pelo Supabase.
// Logs sem e-mails ("u:<hash>"), sem JWT e sem chaves (B5/S13).

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { enviarEmail, moldeRecusaClick } from "../_shared/email.ts";
import { idEmail, semSegredos } from "../_shared/log.ts";
import { alertar } from "../_shared/alerta.ts";
import {
  ASSUNTO_RECUSA, autorizar, decidirReembolso, type FaturaLista, paraPendente, TEXTO_RECUSA, ultimaFaturaPaga, URL_SITE, validarCorpo,
} from "./acoes.ts";
import { enviarBoasVindasClick, garantirUtilizador } from "./boas_vindas.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-02-24.acacia", // versão do SDK stripe@17.7.0 (as faturas vêm na forma acacia: payment_intent no topo)
  httpClient: Stripe.createFetchHttpClient(),
});
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const APP_URL = Deno.env.get("APP_URL") ?? "https://provendrop.com/app.html";
const MINUTOS = Deno.env.get("MAGIC_LINK_MINUTOS") ?? "60";

/** CORS: só a origem do site (APP_URL), a origem antiga do GitHub Pages e localhost; as outras não recebem o cabeçalho. */
const ORIGEM_ANTIGA = "https://afonsolopes22.github.io";
function cors(req: Request): Record<string, string> {
  const origem = req.headers.get("origin") ?? "";
  let ok = false;
  try {
    const o = new URL(origem), app = new URL(APP_URL);
    const local = o.hostname === "localhost" || o.hostname === "127.0.0.1" || o.hostname === "[::1]" || o.hostname.endsWith(".localhost");
    ok = o.origin === app.origin || o.origin === ORIGEM_ANTIGA || local;
  } catch { ok = false; }
  return ok
    ? { "Access-Control-Allow-Origin": origem, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Max-Age": "600", "Vary": "Origin" }
    : { "Vary": "Origin" };
}

const json = (req: Request, b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) } });
const erroInterno = (req: Request) => json(req, { erro: "erro interno" }, 500);

/** E-mail do utilizador do JWT (Authorization: Bearer …), confirmado pelo Auth; null sem sessão válida. O JWT nunca é logado. */
async function emailDoJwt(req: Request): Promise<string | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const jwt = m[1];
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data, error } = await anon.auth.getUser(jwt);
  if (error || !data.user) return null;
  return data.user.email ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { erro: "metodo_nao_permitido" }, 405);

  try {
    const emailJwt = await emailDoJwt(req);
    if (emailJwt === null) return json(req, { erro: "sem_sessao" }, 401);
    const aut = autorizar(emailJwt, Deno.env.get("ADMIN_EMAIL"));
    if (!aut.ok) {
      console.warn(`acesso recusado a ${await idEmail(emailJwt)}`);
      return json(req, { erro: aut.erro }, aut.status);
    }

    const v = validarCorpo(await req.json().catch(() => null));
    if (!v.ok) return json(req, { erro: v.erro }, v.status);
    switch (v.corpo.acao) {
      case "listar": return json(req, await listar());
      case "validar": return await validar(req, v.corpo.email);
      case "recusar": return await recusar(req, v.corpo.email);
    }
  } catch (e) {
    console.error("admin-click:", semSegredos((e as Error).message));
    return erroInterno(req);
  }
});

// ───────────────────────────────────────────────────────────────────────
// Ações

/** Compras Click por confirmar, mais recentes primeiro; só os seis campos públicos. */
async function listar() {
  const q = await admin.from("subscritores")
    .select("email,nome,telefone,loja,codigo_compra,criado_em")
    .eq("origem", "click").eq("estado_click", "pendente")
    .order("criado_em", { ascending: false });
  if (q.error) throw q.error;
  return (q.data ?? []).map((r) => paraPendente(r as Record<string, unknown>));
}

/** Update condicional (é o que torna a ação idempotente): devolve a linha se estava pendente, null se não. */
async function marcar(email: string, estado: "validado" | "recusado"): Promise<{ user_id: string | null; codigo_compra: string | null } | null> {
  const up = await admin.from("subscritores")
    .update({ estado_click: estado })
    .eq("email", email).eq("origem", "click").eq("estado_click", "pendente")
    .select("user_id,codigo_compra");
  if (up.error) throw up.error;
  return (up.data?.[0] as { user_id: string | null; codigo_compra: string | null } | undefined) ?? null;
}

/** Validate: estado_click = 'validado' (tem_acesso passa a true), login garantido, boas-vindas por magic link. */
async function validar(req: Request, email: string): Promise<Response> {
  const uid = await idEmail(email);
  const linha = await marcar(email, "validado");
  if (!linha) return json(req, { erro: "nao_pendente" }, 409);

  let boasVindas: "enviadas" | "por_enviar" = "por_enviar";
  try {
    if (!linha.user_id) {
      const u = await garantirUtilizador(admin, email, APP_URL);
      if (u) await admin.from("subscritores").update({ user_id: u }).eq("email", email);
    }
    await enviarBoasVindasClick(admin, email, APP_URL, MINUTOS);
    const marca = await admin.from("subscritores")
      .update({ boas_vindas_em: new Date().toISOString(), boas_vindas_tentativa_em: null })
      .eq("email", email);
    if (marca.error) throw marca.error;
    boasVindas = "enviadas";
    console.log(`click validado: ${uid}, boas-vindas enviadas`);
  } catch (e) {
    // A linha já está 'validado' sem boas_vindas_em: o varrimento do webhook (pg_cron, 15 em 15 min) repete-as.
    console.error(`click validado: ${uid}, boas-vindas por enviar: ${semSegredos((e as Error).message)}`);
  }
  return json(req, { ok: true, boas_vindas: boasVindas });
}

/**
 * Reject & refund: estado_click = 'recusado'; por cada subscrição Click a cobrar
 * (ativo/em_atraso), reembolso total da última fatura paga (só se houve valor) e
 * cancelamento imediato; e-mail ao cliente com o texto exato do plano.
 */
async function recusar(req: Request, email: string): Promise<Response> {
  const uid = await idEmail(email);
  const linha = await marcar(email, "recusado");
  if (!linha) return json(req, { erro: "nao_pendente" }, 409);
  const codigo = linha.codigo_compra ?? "—";

  let reembolsado = false, cancelada = false;
  try {
    const subs = await admin.from("subscricoes")
      .select("stripe_subscription_id")
      .eq("email", email).eq("origem", "click").in("estado", ["ativo", "em_atraso"]);
    if (subs.error) throw subs.error;
    for (const s of subs.data ?? []) {
      const subId = s.stripe_subscription_id as string;
      const faturas = await stripe.invoices.list({ subscription: subId, limit: 5 });
      const paga = ultimaFaturaPaga(faturas.data as unknown as FaturaLista[]);
      const d = paga ? decidirReembolso(paga) : { reembolsar: false, payment_intent: null };
      if (d.reembolsar && d.payment_intent) {
        await stripe.refunds.create({ payment_intent: d.payment_intent });
        reembolsado = true;
      }
      await stripe.subscriptions.cancel(subId);
      cancelada = true;
    }
  } catch (e) {
    // A linha já está 'recusado' (um novo clique dá 409): o Afonso termina à mão no Stripe.
    console.error(`click recusado: ${uid}, Stripe falhou (reembolsado=${reembolsado}, cancelada=${cancelada}): ${semSegredos((e as Error).message)}`);
    await alertar(`Click rejection needs a manual step in Stripe · ${codigo}`, [
      `Subscriber ${uid} (purchase code ${codigo}) was marked as rejected, but Stripe failed half-way.`,
      `Refund done: ${reembolsado ? "yes" : "no"}. Subscription cancelled: ${cancelada ? "yes" : "no"}.`,
      "Finish in the Stripe dashboard (Customers → search by e-mail): refund the last paid invoice in full and cancel the subscription immediately.",
      "The customer has NOT been e-mailed yet; tell them once it is done.",
    ]);
    return json(req, { erro: "stripe_falhou", reembolsado, cancelada }, 502);
  }

  let emailEnviado = false;
  try {
    await enviarEmail({ to: email, ...moldeRecusaClick(ASSUNTO_RECUSA, TEXTO_RECUSA, URL_SITE) });
    emailEnviado = true;
  } catch (e) {
    console.error(`click recusado: ${uid}, e-mail ao cliente falhou: ${semSegredos((e as Error).message)}`);
  }
  console.log(`click recusado: ${uid}, reembolsado=${reembolsado}, cancelada=${cancelada}, email=${emailEnviado}`);
  return json(req, { ok: true, reembolsado, cancelada, email_enviado: emailEnviado });
}

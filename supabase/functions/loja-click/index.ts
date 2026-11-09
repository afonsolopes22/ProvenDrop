// loja-click · Loja indicada no checkout Click, para a mensagem de WhatsApp (2026-11-08).
//
//   GET ?session_id=cs_…   → 200 { "loja": "Bella Shop" | null }
//                             400 {} se o id não tem a forma ^cs_[A-Za-z0-9_]{8,}$ (sem chamar o Stripe)
//                             404 {} se a sessão não existe, não é da porta Click, não está
//                                    `complete` ou foi criada há mais de 24 h (nunca se diz qual)
//
// Regras em decidir.ts (puras, testadas em index.test.ts). Nunca devolve e-mail, nome
// nem telefone: só a loja (lojaDaSessao, _shared/loja.ts), que o próprio cliente acabou
// de escrever no checkout. A página bem-vindo-click.html desiste ao fim de 2,5 s e
// abre o WhatsApp sem "Store:" se a resposta não chegar a tempo.
//
// CORS: só a origem de APP_URL, a origem antiga do GitHub Pages e localhost (como corrigir-email).
// Deploy:  supabase functions deploy loja-click --no-verify-jwt
// Segredos: STRIPE_SECRET_KEY, STRIPE_PRICE_CLICK, STRIPE_PRICE_DIRETO (opcional), APP_URL.
// Logs sem dados pessoais nem erros internos (B5/S13).

import Stripe from "npm:stripe@17.7.0";
import { semSegredos } from "../_shared/log.ts";
import { decidirResposta, precisaDeLinhas, sessaoIdValido } from "./decidir.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-02-24.acacia", // versão do SDK stripe@17.7.0; os objetos são lidos nas duas formas (compat.ts)
  httpClient: Stripe.createFetchHttpClient(),
});

const APP_URL = Deno.env.get("APP_URL") ?? "https://provendrop.com/app.html";
const PRICE_DIRETO = Deno.env.get("STRIPE_PRICE_DIRETO") ?? "";
const PRICE_CLICK = Deno.env.get("STRIPE_PRICE_CLICK") ?? "";

/** CORS: só a origem do site (APP_URL), a origem antiga do GitHub Pages durante a transição para o domínio
 *  próprio e localhost. Outras origens não recebem o cabeçalho (o browser bloqueia a leitura). */
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
    ? { "Access-Control-Allow-Origin": origem, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "600", "Vary": "Origin" }
    : { "Vary": "Origin" };
}

const json = (req: Request, b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "GET") return json(req, { erro: "método não permitido" }, 405);

  const sid = (new URL(req.url).searchParams.get("session_id") ?? "").trim();
  if (!sessaoIdValido(sid)) return json(req, {}, 400);

  try {
    let s: Stripe.Checkout.Session;
    try {
      s = await stripe.checkout.sessions.retrieve(sid);
    } catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      if (err.statusCode === 404 || err.code === "resource_missing" || /No such checkout\.session/i.test(err.message ?? "")) return json(req, {}, 404);
      throw e;
    }
    // Só pede as line items quando a metadata não diz a origem (M5: um erro aqui é um erro, não "sem preços").
    const linhas = precisaDeLinhas(s, PRICE_DIRETO, PRICE_CLICK) ? (await stripe.checkout.sessions.listLineItems(sid, { limit: 20 })).data : [];
    const d = decidirResposta(s, Date.now(), PRICE_DIRETO, PRICE_CLICK, linhas);
    return json(req, d.corpo, d.status);
  } catch (e) {
    console.error("loja-click:", semSegredos((e as Error).message));
    return json(req, { erro: "erro interno" }, 500);
  }
});

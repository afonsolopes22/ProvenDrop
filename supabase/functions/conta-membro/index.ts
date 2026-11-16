// conta-membro · ações do próprio membro na área de membros (app.html), desde 2026-11-14 (teste grátis Click):
//
//   POST, cabeçalho Authorization: Bearer <JWT do membro>, corpo JSON:
//     {"acao":"kit","zip_path":"…"}   → {url}  link assinado (120 s) do kit, para quem está em TESTE:
//                                        só kits da lista mais recente e 1 kit por dia de Lisboa (o mesmo kit
//                                        pode voltar a ser descarregado nesse dia). Regras em regras.ts.
//     {"acao":"comecar_plano"}         → {ok:true}  "Start my plan now": acaba o teste (trial_end = now) e cobra
//                                        o primeiro mês já. Se o cartão falhar, o Stripe não muda nada (402).
//                                        Sem cartão (teste sem cartão): 409 {"erro":"sem_cartao"} (a página abre adicionar_cartao).
//     {"acao":"adicionar_cartao"}      → {url}  Checkout do Stripe em modo setup para guardar um cartão a meio do teste
//                                        (metadata pd_acao=cartao, subscricao); o stripe-webhook torna-o o cartão da
//                                        subscrição em checkout.session.completed. Volta a app.html?cartao=ok.
//     {"acao":"assinar_click"}         → {url}  "Start my plan" de um cliente Click validado cujo teste acabou sem cartão
//                                        (ou que já tinha usado o teste): Checkout de subscrição SEM teste, com cartão,
//                                        metadata pd_acao=assinar_click. Volta a app.html?plano=ok.
//
// Só atua sobre a subscrição de quem chama (a linha de subscritores com user_id do JWT). O JWT é validado aqui
// (verify_jwt = false em config.toml). Respostas:
//   sem sessão 401 {"erro":"sem_sessao"}; corpo inválido 400; fora do teste 409 {"erro":"nao_em_teste"};
//   kit de outro dia 403 {"erro":"fora_da_lista"}; segundo kit no dia 429 {"erro":"limite_diario"};
//   plano já começado 409 {"erro":"ja_comecou"}; cartão recusado 402 {"erro":"pagamento_falhou"};
//   assinar_click sem direito 403 {"erro":"nao_permitido"}, com plano a correr 409 {"erro":"ja_tem_plano"}.
// O estado passa de 'teste' a 'ativo' pelos eventos do Stripe no stripe-webhook (um só escritor).
//
// Deploy:  supabase functions deploy conta-membro --no-verify-jwt
// Segredos: STRIPE_SECRET_KEY, STRIPE_PRICE_CLICK, APP_URL. SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são injetadas.
// Logs sem e-mails nem JWT.

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { temAcesso } from "../_shared/acesso.ts";
import { semSegredos } from "../_shared/log.ts";
import { decidirAdicionarCartao, decidirAssinar, decidirComecar, decidirKit, diaLisboa } from "./regras.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2025-02-24.acacia", httpClient: Stripe.createFetchHttpClient() });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
const APP_URL = Deno.env.get("APP_URL") ?? "https://provendrop.com/app.html";
const SEGUNDOS_LINK = 120;
const PRICE_CLICK = Deno.env.get("STRIPE_PRICE_CLICK") ?? "";
const voltar = (q: string) => `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}${q}`;
const TERMOS = "I agree to the [Terms of service](https://provendrop.com/terms.html), [Refund policy](https://provendrop.com/refunds.html) and [Privacy policy](https://provendrop.com/privacy.html).";

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

/** id do utilizador do JWT, confirmado pelo Auth; null sem sessão válida. */
async function utilizador(req: Request): Promise<string | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${m[1]}` } } });
  const { data, error } = await anon.auth.getUser(m[1]);
  return error || !data.user ? null : data.user.id;
}

interface Linha { email: string; origem: string; estado: string; estado_click: string | null; bloqueado_em: string | null; em_atraso_desde: string | null; stripe_subscription_id: string | null }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { erro: "metodo_nao_permitido" }, 405);
  try {
    const uid = await utilizador(req);
    if (!uid) return json(req, { erro: "sem_sessao" }, 401);
    const corpo = await req.json().catch(() => null) as { acao?: unknown; zip_path?: unknown } | null;
    const acao = corpo?.acao;
    if (acao !== "kit" && acao !== "comecar_plano" && acao !== "adicionar_cartao" && acao !== "assinar_click") return json(req, { erro: "corpo_invalido" }, 400);

    const q = await admin.from("subscritores").select("email,origem,estado,estado_click,bloqueado_em,em_atraso_desde,stripe_subscription_id").eq("user_id", uid).maybeSingle();
    if (q.error) throw q.error;
    const s = q.data as Linha | null;
    const emTeste = !!s && s.estado === "teste" && temAcesso(s);

    if (acao === "kit") {
      const pedido = typeof corpo?.zip_path === "string" ? corpo.zip_path.trim() : "";
      if (!pedido || pedido.length > 300) return json(req, { erro: "corpo_invalido" }, 400);
      const ultimo = await admin.rpc("ultimo_dia_feed");
      if (ultimo.error) throw ultimo.error;
      const lista = await admin.from("feed_dia").select("zip_path").eq("dia", ultimo.data as string).not("retirada", "is", true).not("zip_path", "is", null);
      if (lista.error) throw lista.error;
      const dia = diaLisboa();
      const ja = await admin.from("kit_downloads").select("zip_path").eq("user_id", uid).eq("dia", dia).maybeSingle();
      if (ja.error) throw ja.error;
      const d = decidirKit({ emTeste, pedido, daLista: (lista.data ?? []).map((r: { zip_path: string }) => r.zip_path), jaHoje: (ja.data as { zip_path: string } | null)?.zip_path ?? null });
      if (!d.ok) return json(req, { erro: d.erro }, d.erro === "nao_em_teste" ? 409 : d.erro === "fora_da_lista" ? 403 : 429);
      if (d.registar) {
        // Chave (user_id, dia): dois pedidos ao mesmo tempo só deixam um kit; relê-se quem ganhou.
        const ins = await admin.from("kit_downloads").upsert({ user_id: uid, dia, zip_path: pedido }, { onConflict: "user_id,dia", ignoreDuplicates: true });
        if (ins.error) throw ins.error;
        const dono = await admin.from("kit_downloads").select("zip_path").eq("user_id", uid).eq("dia", dia).maybeSingle();
        if (dono.error) throw dono.error;
        if ((dono.data as { zip_path: string } | null)?.zip_path !== pedido) return json(req, { erro: "limite_diario" }, 429);
      }
      const url = await admin.storage.from("kits").createSignedUrl(pedido, SEGUNDOS_LINK);
      if (url.error || !url.data?.signedUrl) throw url.error ?? new Error("sem link assinado");
      return json(req, { url: url.data.signedUrl });
    }

    if (acao === "assinar_click") {
      if (!s) return json(req, { erro: "nao_permitido" }, 403);
      const d = decidirAssinar(s);
      if (!d.ok) return json(req, { erro: d.erro }, d.erro === "ja_tem_plano" ? 409 : 403);
      // O cliente Stripe da última subscrição (o checkout fica com o e-mail e o cliente de sempre).
      const ult = await admin.from("subscricoes").select("stripe_customer_id").eq("email", s.email).not("stripe_customer_id", "is", null)
        .order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (ult.error) throw ult.error;
      const customer = (ult.data as { stripe_customer_id: string } | null)?.stripe_customer_id;
      const sessao = await stripe.checkout.sessions.create({
        mode: "subscription", line_items: [{ price: PRICE_CLICK, quantity: 1 }],
        ...(customer ? { customer } : { customer_email: s.email }),
        payment_method_collection: "always", allow_promotion_codes: true,
        consent_collection: { terms_of_service: "required" }, custom_text: { terms_of_service_acceptance: { message: TERMOS } },
        metadata: { origem: "click", pd_acao: "assinar_click" }, subscription_data: { metadata: { origem: "click" } },
        success_url: voltar("plano=ok"), cancel_url: APP_URL,
      });
      return json(req, { url: sessao.url });
    }

    if (!emTeste || !s?.stripe_subscription_id) return json(req, { erro: "nao_em_teste" }, 409);
    const sub = await stripe.subscriptions.retrieve(s.stripe_subscription_id);
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

    if (acao === "adicionar_cartao") {
      const d = decidirAdicionarCartao({ emTeste, statusStripe: sub.status });
      if (!d.ok) return json(req, { erro: d.erro }, 409);
      const sessao = await stripe.checkout.sessions.create({
        mode: "setup", customer, currency: "eur", payment_method_types: ["card"],
        metadata: { pd_acao: "cartao", subscricao: sub.id }, setup_intent_data: { metadata: { pd_acao: "cartao", subscricao: sub.id } },
        success_url: voltar("cartao=ok"), cancel_url: APP_URL,
      });
      return json(req, { url: sessao.url });
    }

    // comecar_plano
    const d = decidirComecar({ emTeste, statusStripe: sub.status });
    if (!d.ok) return json(req, { erro: d.erro }, 409);
    // Teste sem cartão: não há com que cobrar; a página abre "adicionar cartão".
    const temCartao = !!sub.default_payment_method || (await stripe.paymentMethods.list({ customer, type: "card", limit: 1 })).data.length > 0;
    if (!temCartao) return json(req, { erro: "sem_cartao" }, 409);
    try {
      await stripe.subscriptions.update(sub.id, { trial_end: "now", payment_behavior: "error_if_incomplete", proration_behavior: "none" });
    } catch (e) {
      const tipo = (e as { type?: string }).type ?? "";
      if (tipo === "StripeCardError") return json(req, { erro: "pagamento_falhou" }, 402);
      throw e;
    }
    return json(req, { ok: true });
  } catch (e) {
    console.error("conta-membro:", semSegredos((e as Error).message));
    return json(req, { erro: "erro interno" }, 500);
  }
});

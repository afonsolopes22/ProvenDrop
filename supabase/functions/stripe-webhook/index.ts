// Webhook do Stripe → subscricoes (uma linha por subscrição) e subscritores
// (acesso derivado), boas-vindas por magic link, alertas ao Afonso.
//
// Eventos tratados (o estado é SEMPRE relido com stripe.subscriptions.retrieve,
// nunca copiado da fotografia do evento — C1, M2, M3, B1):
//   checkout.session.completed                 → sincroniza a subscrição da sessão
//   customer.subscription.created/updated/deleted → sincroniza a subscrição
//   invoice.paid / invoice.payment_failed      → sincroniza a subscrição da fatura
//   charge.dispute.created                     → bloqueia o acesso do cliente + alerta (A4)
//   charge.refunded                            → só alerta (A4)
//
// Modo (S1/M11): com STRIPE_ACCEPT_TEST=1 só entram eventos livemode=false; sem
// ele só entram livemode=true. Os outros recebem 200 vazio e um aviso no log.
//
// Idempotência (A1/A2): stripe_eventos nunca é apagada. Repetido já concluído →
// 200; repetido em curso há menos de 5 min → 503 (o Stripe volta a tentar);
// em curso há mais tempo (a função morreu) → reprocessa.
//
// Acesso: subscritores.origem/estado são derivados de subscricoes pela função
// SQL recalcular_subscritor (a melhor direto manda; um evento click nunca
// retira acesso a uma direto — C2/S3). tem_acesso() = direto, não bloqueado,
// ativo ou em_atraso há menos de 7 dias (M1).
//
// Boas-vindas (A3): só com acesso, com reserva atómica (reservar_boas_vindas),
// magic link por token_hash (não é consumido por scanners de e-mail), marcadas
// só depois de o Resend aceitar. Varrimento ?varrer_boas_vindas=1 (pg_cron,
// 15 em 15 min) repete as que faltam, até 5 tentativas, depois alerta.
// E-mail de regresso quando cancelado → ativo.
//
// Modos manuais (x-cron-secret, comparação em tempo constante — S5):
//   POST …?reenviar_boas_vindas=<email>   reenvia a quem tem acesso (B3)
//   POST …?varrer_boas_vindas=1           o mesmo que o pg_cron faz
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Segredos: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_ACCEPT_TEST,
//   STRIPE_PRICE_DIRETO, STRIPE_PRICE_CLICK, STRIPE_PAYMENT_LINK_DIRETO (opcional),
//   RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, ALERT_EMAIL, APP_URL, HORA_ENVIO,
//   MAGIC_LINK_MINUTOS, CRON_SECRET. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
//   são injetadas pelo Supabase.
//
// Logs e respostas sem e-mails nem erros internos (B5/S13): os e-mails aparecem
// como "u:<hash>" e as respostas 500 dizem só "erro interno".

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { enviarEmail, esc, molde } from "../_shared/email.ts";
import { cronSecretOk } from "../_shared/auth.ts";
import { idEmail, semSegredos } from "../_shared/log.ts";
import { alertar } from "../_shared/alerta.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const APP_URL = Deno.env.get("APP_URL") ?? "https://afonsolopes22.github.io/ProvenDrop/app.html";
const LINK_DIRETO = Deno.env.get("STRIPE_PAYMENT_LINK_DIRETO") ?? "";
const PRICE_DIRETO = Deno.env.get("STRIPE_PRICE_DIRETO") ?? "";
const PRICE_CLICK = Deno.env.get("STRIPE_PRICE_CLICK") ?? "";
const MINUTOS = Deno.env.get("MAGIC_LINK_MINUTOS") ?? "60";
const ACEITA_TESTE = (Deno.env.get("STRIPE_ACCEPT_TEST") ?? "") === "1";
const EM_CURSO_MIN = 5;          // A2: janela em que um evento repetido recebe 503
const RESERVA_MIN = 10;          // A3: nova tentativa de boas-vindas só passados 10 min
const MAX_TENTATIVAS = 5;        // A3: depois disto, alerta
const TOLERANCIA_DIAS = 7;       // M1

/** "9" ou "09:00" → "09:00"; vazio → "[HOUR]" (nunca se inventa uma hora). */
function horaTexto(): string {
  const h = (Deno.env.get("HORA_ENVIO") ?? "").trim();
  const m = h.match(/^(\d{1,2})(?::(\d{2}))?$/);
  return m ? `${m[1].padStart(2, "0")}:${m[2] ?? "00"}` : "[HOUR]";
}
const HORA = horaTexto();

type Origem = "direto" | "click";
type Estado = "ativo" | "em_atraso" | "incompleto" | "cancelado";

interface Subscritor {
  email: string; origem: Origem; estado: Estado; user_id: string | null;
  boas_vindas_em: string | null; boas_vindas_tentativas: number; regresso_em: string | null;
  bloqueado_em: string | null; em_atraso_desde: string | null; acesso_fim: string | null;
}
const CAMPOS = "email,origem,estado,user_id,boas_vindas_em,boas_vindas_tentativas,regresso_em,bloqueado_em,em_atraso_desde,acesso_fim";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const erroInterno = (status = 500) => json({ erro: "erro interno" }, status);

/** Espelho de public.tem_acesso(). */
function temAcesso(s: Subscritor | null | undefined): boolean {
  if (!s || s.origem !== "direto" || s.bloqueado_em) return false;
  if (s.estado === "ativo") return true;
  if (s.estado === "em_atraso" && s.em_atraso_desde) {
    return Date.now() - new Date(s.em_atraso_desde).getTime() < TOLERANCIA_DIAS * 864e5;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const url = new URL(req.url);

  // Modos manuais / pg_cron (protegidos por x-cron-secret, tempo constante).
  const reenviar = url.searchParams.get("reenviar_boas_vindas");
  const varrer = url.searchParams.get("varrer_boas_vindas");
  if (reenviar !== null || varrer !== null) {
    if (!(await cronSecretOk(req))) return json({ erro: "não autorizado" }, 401);
    try {
      if (varrer !== null) return json(await varrerBoasVindas());
      return await reenviarBoasVindas(reenviar!.trim().toLowerCase());
    } catch (e) {
      console.error("modo manual:", semSegredos((e as Error).message));
      return erroInterno();
    }
  }

  const assinatura = req.headers.get("stripe-signature") ?? "";
  const corpo = await req.text();

  // Verificação da assinatura: sem segredo configurado nada é aceite.
  const segredo = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!segredo) return erroInterno();
  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(corpo, assinatura, segredo, undefined, cryptoProvider);
  } catch {
    return json({ erro: "assinatura inválida" }, 400);
  }

  // S1/M11: só o modo configurado. O outro recebe 200 vazio (o Stripe não repete) e um aviso.
  if (evento.livemode === ACEITA_TESTE) {
    console.warn(`evento ${evento.id} (${evento.type}) ignorado: livemode=${evento.livemode}, STRIPE_ACCEPT_TEST=${ACEITA_TESTE ? "1" : "0"}`);
    return json({ ok: true, ignorado: evento.livemode ? "evento live com função em modo de teste" : "evento de teste com função em modo real" });
  }

  // A1/A2: idempotência sem apagar nada.
  const ins = await admin.from("stripe_eventos").insert({ id: evento.id, tipo: evento.type });
  if (ins.error) {
    if (ins.error.code !== "23505") { console.error("stripe_eventos:", semSegredos(ins.error.message)); return erroInterno(); }
    const ex = await admin.from("stripe_eventos").select("processado_em,recebido_em,tentativas").eq("id", evento.id).maybeSingle();
    if (ex.error || !ex.data) return erroInterno();
    if (ex.data.processado_em) return json({ ok: true, repetido: true });
    const recente = Date.now() - new Date(ex.data.recebido_em).getTime() < EM_CURSO_MIN * 60e3;
    if (recente) return json({ erro: "evento em curso, tentar mais tarde" }, 503);
    await admin.from("stripe_eventos").update({ recebido_em: new Date().toISOString(), tentativas: (ex.data.tentativas ?? 1) + 1 }).eq("id", evento.id);
    console.warn(`evento ${evento.id} reprocessado (tentativa ${(ex.data.tentativas ?? 1) + 1})`);
  }

  try {
    let resultado: Record<string, unknown> = {};
    switch (evento.type) {
      case "checkout.session.completed":
        resultado = await aoCompletarCheckout(evento.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = evento.data.object as Stripe.Subscription;
        resultado = await sincronizarSubscricao(sub.id, null, evento.type === "customer.subscription.created");
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = evento.data.object as Stripe.Invoice;
        const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null;
        if (!subId) { console.warn(`${evento.type} ${evento.id} sem subscrição: ignorado`); break; } // B2
        resultado = await sincronizarSubscricao(subId, null, false);
        break;
      }
      case "charge.dispute.created":
        resultado = await aoAbrirDisputa(evento.data.object as Stripe.Dispute);
        break;
      case "charge.refunded":
        resultado = await aoReembolsar(evento.data.object as Stripe.Charge);
        break;
      default:
        // outros eventos são ignorados de propósito
    }
    const fim = await admin.from("stripe_eventos").update({ processado_em: new Date().toISOString() }).eq("id", evento.id);
    if (fim.error) console.error("stripe_eventos.processado_em:", semSegredos(fim.error.message));
    return json({ ok: true, ...resultado });
  } catch (e) {
    // Fica sem processado_em: o Stripe volta a tentar e, passados 5 min, reprocessa.
    console.error(evento.type, evento.id, semSegredos((e as Error).message));
    return erroInterno();
  }
});

// ───────────────────────────────────────────────────────────────────────
// Origem

function origemDeMetadata(m: Stripe.Metadata | null | undefined): Origem | null {
  const o = (m?.origem ?? "").trim().toLowerCase();
  return o === "direto" || o === "click" ? o : null;
}

function origemDePrecos(precos: string[]): Origem | null {
  if (PRICE_DIRETO && precos.includes(PRICE_DIRETO)) return "direto";
  if (PRICE_CLICK && precos.includes(PRICE_CLICK)) return "click";
  return null;
}

/** M5: um erro da API ao listar as linhas é um erro (o Stripe repete), não "sem preços". */
async function precosDaSessao(s: Stripe.Checkout.Session): Promise<string[]> {
  const linhas = await stripe.checkout.sessions.listLineItems(s.id, { limit: 20 });
  return linhas.data.map((l) => l.price?.id ?? "").filter(Boolean);
}

async function origemDaSessao(s: Stripe.Checkout.Session): Promise<Origem | null> {
  const m = origemDeMetadata(s.metadata);
  if (m) return m;
  const porPreco = origemDePrecos(await precosDaSessao(s));
  if (porPreco) return porPreco;
  if (LINK_DIRETO && s.payment_link === LINK_DIRETO) return "direto";
  return null;
}

function origemDaSubscricao(sub: Stripe.Subscription): Origem | null {
  return origemDeMetadata(sub.metadata) ?? origemDePrecos(sub.items.data.map((i) => i.price?.id ?? ""));
}

// ───────────────────────────────────────────────────────────────────────
// Estado

function estadoDe(status: Stripe.Subscription.Status): Estado {
  switch (status) {
    case "active":
    case "trialing":
      return "ativo";
    case "past_due":
    case "unpaid":
      return "em_atraso";
    case "incomplete":
      return "incompleto";
    default: // canceled, incomplete_expired, paused
      return "cancelado";
  }
}

/**
 * Relê a subscrição no Stripe e escreve o estado ATUAL em subscricoes; depois
 * recalcula subscritores (acesso derivado), cria o login quando há acesso,
 * tenta as boas-vindas e deteta o regresso. `origemHint` vem da sessão de
 * checkout (metadata / payment link); `nova` liga o alerta de duplicados (C2).
 */
async function sincronizarSubscricao(subId: string, origemHint: Origem | null, nova: boolean): Promise<Record<string, unknown>> {
  const sub = await stripe.subscriptions.retrieve(subId, { expand: ["customer"] });
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const cliente = typeof sub.customer === "string" ? null : sub.customer;
  const emailStripe = cliente && !cliente.deleted ? (cliente.email ?? "").trim().toLowerCase() : "";

  const existente = await admin.from("subscricoes").select("email,origem,em_atraso_desde").eq("stripe_subscription_id", sub.id).maybeSingle();
  if (existente.error) throw existente.error;

  const email = emailStripe || existente.data?.email || "";
  if (!email) { console.warn(`subscrição ${sub.id} sem e-mail: ignorada`); return { ignorado: "sem e-mail" }; }
  const uid = await idEmail(email);

  let origem: Origem | null = origemHint ?? origemDaSubscricao(sub) ?? (existente.data?.origem as Origem | undefined) ?? null;
  if (!origem) { console.warn(`origem desconhecida na subscrição ${sub.id} (${uid}): registada como "click", sem acesso`); origem = "click"; }

  const estado = estadoDe(sub.status);
  const emAtrasoDesde = estado === "em_atraso" ? (existente.data?.em_atraso_desde ?? new Date().toISOString()) : null;
  const cancelAt = sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString()
    : sub.cancel_at_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

  const up = await admin.from("subscricoes").upsert({
    stripe_subscription_id: sub.id, stripe_customer_id: customer, email, origem, estado,
    cancel_at: cancelAt, em_atraso_desde: emAtrasoDesde,
  }, { onConflict: "stripe_subscription_id" });
  if (up.error) throw up.error;

  // Garante a linha do subscritor (sem tocar em nada se já existir) e deriva origem/estado.
  const antes = await admin.from("subscritores").select(CAMPOS).eq("email", email).maybeSingle();
  if (antes.error) throw antes.error;
  if (!antes.data) {
    const novo = await admin.from("subscritores").insert({ email, origem, estado });
    if (novo.error && novo.error.code !== "23505") throw novo.error;
  }
  const rec = await admin.rpc("recalcular_subscritor", { p_email: email });
  if (rec.error) throw rec.error;
  const depois = rec.data as Subscritor | null;
  if (!depois) throw new Error("recalcular_subscritor sem linha");

  const resultado: Record<string, unknown> = { subscricao: sub.id, estado, origem, acesso: temAcesso(depois) };

  // C2: o mesmo e-mail com duas subscrições a cobrar.
  if (nova || estado === "ativo") {
    const ativas = await admin.from("subscricoes").select("stripe_subscription_id,origem,estado").eq("email", email).in("estado", ["ativo", "em_atraso"]);
    if (!ativas.error && (ativas.data?.length ?? 0) > 1) {
      resultado.duplicadas = ativas.data!.length;
      await alertar("Mesmo e-mail com duas subscrições a cobrar", [
        `Subscritor ${uid} tem ${ativas.data!.length} subscrições ativas/em atraso:`,
        ...ativas.data!.map((s) => `• ${s.stripe_subscription_id} (${s.origem}, ${s.estado})`),
        "Ver no Stripe (Clientes → pesquisar pelo e-mail) e cancelar/reembolsar a que não deve existir.",
      ]);
    }
  }

  if (depois.origem !== "direto") return resultado;

  if (temAcesso(depois)) {
    // Login só para quem tem acesso (M3: incomplete não cria utilizador nem recebe e-mail).
    if (!depois.user_id) {
      const uidAuth = await garantirUtilizador(email, null);
      if (uidAuth) { await admin.from("subscritores").update({ user_id: uidAuth }).eq("email", email); depois.user_id = uidAuth; }
    }
    if (!depois.boas_vindas_em) {
      resultado.boas_vindas = await tentarBoasVindas(email, "boas_vindas") ? "enviadas" : "por_enviar";
    } else if (antes.data && antes.data.estado === "cancelado" && depois.estado === "ativo") {
      // Regresso: já tinha sido membro, voltou a pagar.
      resultado.regresso = await tentarBoasVindas(email, "regresso") ? "enviado" : "por_enviar";
    }
  }
  return resultado;
}

async function aoCompletarCheckout(s: Stripe.Checkout.Session): Promise<Record<string, unknown>> {
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return { ignorado: `payment_status=${s.payment_status}` };
  const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;
  if (!subId) { console.warn(`sessão ${s.id} sem subscrição: ignorada`); return { ignorado: "sem subscrição" }; }
  // A origem da sessão (metadata do Payment Link) é o sinal mais fiável.
  return sincronizarSubscricao(subId, await origemDaSessao(s), true);
}

// ───────────────────────────────────────────────────────────────────────
// A4 · disputas e reembolsos

async function clienteDaCharge(ch: Stripe.Charge | Stripe.Dispute): Promise<string | null> {
  if ("customer" in ch && ch.customer) return typeof ch.customer === "string" ? ch.customer : ch.customer.id;
  const chargeId = "charge" in ch ? (typeof ch.charge === "string" ? ch.charge : ch.charge?.id ?? null) : null;
  if (!chargeId) return null;
  const c = await stripe.charges.retrieve(chargeId);
  return typeof c.customer === "string" ? c.customer : c.customer?.id ?? null;
}

async function aoAbrirDisputa(d: Stripe.Dispute): Promise<Record<string, unknown>> {
  const customer = await clienteDaCharge(d);
  const prazo = d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000).toISOString().slice(0, 10) : "sem prazo";
  const valor = `${(d.amount / 100).toFixed(2)} ${d.currency.toUpperCase()}`;
  let bloqueados = 0;
  if (customer) {
    const subs = await admin.from("subscricoes").select("email").eq("stripe_customer_id", customer);
    const emails = [...new Set((subs.data ?? []).map((s) => s.email))];
    for (const email of emails) {
      const b = await admin.from("subscritores").update({ bloqueado_em: new Date().toISOString(), bloqueado_motivo: `disputa ${d.id}` })
        .eq("email", email).is("bloqueado_em", null).select("email");
      bloqueados += b.data?.length ?? 0;
    }
  }
  await alertar(`Disputa aberta: ${valor} (responder até ${prazo})`, [
    `Disputa ${d.id}, motivo "${d.reason}", estado ${d.status}.`,
    `Cliente ${customer ?? "desconhecido"}; acesso bloqueado em ${bloqueados} subscritor(es).`,
    `Prazo para submeter provas: ${prazo}. Stripe → Pagamentos → Disputas.`,
    "Depois de resolvida: cancelar a subscrição no Stripe e, se for caso disso, desbloquear (update subscritores set bloqueado_em = null …).",
  ]);
  return { disputa: d.id, bloqueados, prazo };
}

async function aoReembolsar(ch: Stripe.Charge): Promise<Record<string, unknown>> {
  const customer = await clienteDaCharge(ch);
  const total = ch.amount_refunded >= ch.amount;
  const valor = `${(ch.amount_refunded / 100).toFixed(2)} ${ch.currency.toUpperCase()}`;
  await alertar(`Reembolso ${total ? "total" : "parcial"}: ${valor}`, [
    `Charge ${ch.id}, cliente ${customer ?? "desconhecido"}, reembolsado ${valor} de ${(ch.amount / 100).toFixed(2)}.`,
    "O acesso NÃO foi cortado automaticamente (pode ser parcial ou de boa vontade).",
    "Se o reembolso encerra a relação: cancelar a subscrição no Stripe (o webhook corta o acesso) e confirmar que não há nova cobrança.",
  ]);
  return { reembolso: ch.id, total };
}

// ───────────────────────────────────────────────────────────────────────
// Boas-vindas (A3) e regresso

/** Cria o utilizador de Auth se não existir e devolve o seu id. */
async function garantirUtilizador(email: string, userIdAtual: string | null): Promise<string | null> {
  if (userIdAtual) return userIdAtual;
  const criado = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!criado.error) return criado.data.user?.id ?? null;
  if (!/already|exists|registered/i.test(criado.error.message) && criado.error.code !== "email_exists") throw criado.error;
  const l = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: APP_URL } });
  if (l.error) throw l.error;
  return l.data.user?.id ?? null;
}

/** Link de entrada por token_hash: só é consumido quando a página corre verifyOtp (S12). */
async function linkDeEntrada(email: string): Promise<string> {
  const l = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: APP_URL } });
  if (l.error) throw l.error;
  const th = l.data.properties?.hashed_token;
  if (!th) throw new Error("magic link sem hashed_token");
  return `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}token_hash=${encodeURIComponent(th)}&type=magiclink`;
}

/**
 * Boas-vindas com reserva atómica (reservar_boas_vindas só devolve um número
 * se houver acesso, nada enviado e nenhuma tentativa nos últimos 10 min).
 * Marca boas_vindas_em só depois de o Resend aceitar. Devolve true se enviou.
 */
async function tentarBoasVindas(email: string, tipo: "boas_vindas" | "regresso"): Promise<boolean> {
  const uid = await idEmail(email);
  let tentativa = 0;
  if (tipo === "boas_vindas") {
    const r = await admin.rpc("reservar_boas_vindas", { p_email: email, p_minutos: RESERVA_MIN });
    if (r.error) throw r.error;
    if (r.data == null) return false; // nada a fazer (já enviadas, sem acesso ou tentativa recente)
    tentativa = Number(r.data);
  }
  try {
    const s = await admin.from("subscritores").select(CAMPOS).eq("email", email).maybeSingle();
    if (s.error || !s.data) throw new Error("subscritor não encontrado");
    const sub = s.data as Subscritor;
    if (!temAcesso(sub)) return false;
    if (!sub.user_id) {
      const u = await garantirUtilizador(email, null);
      if (u) await admin.from("subscritores").update({ user_id: u }).eq("email", email);
    }
    const link = await linkDeEntrada(email);
    if (tipo === "boas_vindas") await enviarBoasVindas(email, link);
    else await enviarRegresso(email, link);
    const marca = await admin.from("subscritores")
      .update(tipo === "boas_vindas" ? { boas_vindas_em: new Date().toISOString(), boas_vindas_tentativa_em: null } : { regresso_em: new Date().toISOString() })
      .eq("email", email);
    if (marca.error) throw marca.error;
    console.log(`${tipo} enviadas a ${uid}`);
    return true;
  } catch (e) {
    console.error(`${tipo} para ${uid} falharam (tentativa ${tentativa}): ${semSegredos((e as Error).message)}`);
    if (tipo === "boas_vindas" && tentativa === MAX_TENTATIVAS) {
      await alertar("Boas-vindas sem envio após 5 tentativas", [
        `Subscritor ${uid} tem acesso mas o e-mail de boas-vindas falhou ${MAX_TENTATIVAS} vezes (ver logs de stripe-webhook).`,
        "Causa habitual: Resend em modo de teste (só entrega ao e-mail da conta) ou domínio por verificar.",
        "Depois de corrigir: POST …/stripe-webhook?reenviar_boas_vindas=<email> com x-cron-secret.",
      ]);
    }
    return false;
  }
}

/** pg_cron (15 em 15 min) e modo manual: repete as boas-vindas que faltam. */
async function varrerBoasVindas(): Promise<Record<string, unknown>> {
  const limite = new Date(Date.now() - RESERVA_MIN * 60e3).toISOString();
  const q = await admin.from("subscritores").select("email,boas_vindas_tentativas")
    .eq("origem", "direto").is("boas_vindas_em", null).is("bloqueado_em", null)
    .in("estado", ["ativo", "em_atraso"])
    .lte("boas_vindas_tentativas", MAX_TENTATIVAS)
    .or(`boas_vindas_tentativa_em.is.null,boas_vindas_tentativa_em.lt.${limite}`)
    .limit(50);
  if (q.error) throw q.error;
  let enviadas = 0, falhadas = 0, esgotadas = 0;
  for (const s of q.data ?? []) {
    if ((s.boas_vindas_tentativas ?? 0) >= MAX_TENTATIVAS) { esgotadas++; continue; }
    (await tentarBoasVindas(s.email, "boas_vindas")) ? enviadas++ : falhadas++;
  }
  return { ok: true, candidatos: q.data?.length ?? 0, enviadas, falhadas, esgotadas };
}

/** B3: só reenvia a quem tem acesso; mensagem própria para os outros estados. */
async function reenviarBoasVindas(email: string): Promise<Response> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ erro: "e-mail inválido" }, 400);
  const q = await admin.from("subscritores").select(CAMPOS).eq("email", email).maybeSingle();
  if (q.error) throw q.error;
  if (!q.data) return json({ erro: "subscritor não encontrado" }, 404);
  const s = q.data as Subscritor;
  if (s.origem !== "direto") return json({ erro: "subscritor da porta click: não tem área nem boas-vindas" }, 409);
  if (!temAcesso(s)) return json({ erro: `sem acesso (estado ${s.estado}${s.bloqueado_em ? ", bloqueado" : ""}): nada a reenviar` }, 409);
  // Reenvio forçado: limpa a reserva e a marca para a reserva voltar a passar.
  const limpar = await admin.from("subscritores").update({ boas_vindas_em: null, boas_vindas_tentativa_em: null }).eq("email", email);
  if (limpar.error) throw limpar.error;
  const ok = await tentarBoasVindas(email, "boas_vindas");
  return json({ ok, estado: s.estado, enviadas_antes_em: s.boas_vindas_em, boas_vindas: ok ? "enviadas" : "falharam (ver logs)" }, ok ? 200 : 502);
}

// ───────────────────────────────────────────────────────────────────────
// E-mails (só porta "direto")

async function enviarBoasVindas(email: string, link: string) {
  const texto =
    `Hi! Your access is active.\n\n` +
    `Sign in to your member area with this link (it is personal and valid for ${MINUTOS} minutes):\n${link}\n\n` +
    `From tomorrow, every day at ${HORA} (Lisbon time), you receive here the day's collections.\n\n` +
    `Any question, reply to this e-mail.`;
  const html = molde(
    "Your access is active",
    `<p>Hi! Your access is active.</p>
     <p>Sign in to your member area with this button (the link is personal and valid for ${esc(MINUTOS)} minutes):</p>`,
    { texto: "Sign in to ProvenDrop", url: link },
    `From tomorrow, every day at ${esc(HORA)} (Lisbon time), you receive here the day's collections. Any question, reply to this e-mail.`,
  );
  await enviarEmail({ to: email, subject: "Welcome to ProvenDrop: your access", html, text: texto });
}

async function enviarRegresso(email: string, link: string) {
  const texto =
    `Welcome back! Your access is active again.\n\n` +
    `Sign in to your member area with this link (personal, valid for ${MINUTOS} minutes):\n${link}\n\n` +
    `Your niche and countries are as you left them. The day's collections arrive every day at ${HORA} (Lisbon time).`;
  const html = molde(
    "Welcome back",
    `<p>Welcome back! Your access is active again.</p>
     <p>Sign in to your member area with this button (personal, valid for ${esc(MINUTOS)} minutes):</p>`,
    { texto: "Sign in to ProvenDrop", url: link },
    `Your niche and countries are as you left them. The day's collections arrive every day at ${esc(HORA)} (Lisbon time).`,
  );
  await enviarEmail({ to: email, subject: "Welcome back to ProvenDrop", html, text: texto });
}

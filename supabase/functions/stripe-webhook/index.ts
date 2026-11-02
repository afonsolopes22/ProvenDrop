// Webhook do Stripe → cria/atualiza subscritores e envia o e-mail de boas-vindas
// (magic link) aos subscritores da porta "direto".
//
// Eventos tratados:
//   checkout.session.completed       → regista o subscritor (direto: cria login + boas-vindas)
//   customer.subscription.created    → garante o registo (os eventos podem chegar fora de ordem)
//   customer.subscription.updated    → estado (ativo / em_atraso / cancelado)
//   customer.subscription.deleted    → estado cancelado
//   invoice.paid                     → estado ativo (recupera de em_atraso)
//   invoice.payment_failed           → estado em_atraso
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Segredos (supabase secrets set): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   STRIPE_PRICE_DIRETO, STRIPE_PRICE_CLICK (price_…), STRIPE_PAYMENT_LINK_DIRETO
//   (plink_…, opcional), RESEND_API_KEY, EMAIL_FROM, APP_URL, HORA_ENVIO,
//   MAGIC_LINK_MINUTOS. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas
//   automaticamente pelo Supabase.
//
// Origem do cliente ("direto" | "click"), por esta ordem:
//   1. metadata.origem da sessão de checkout / da subscrição (copiada do Payment Link);
//   2. price_id das linhas da compra, comparado com STRIPE_PRICE_DIRETO / STRIPE_PRICE_CLICK;
//   3. id do Payment Link direto (STRIPE_PAYMENT_LINK_DIRETO).
// Sem nenhum destes sinais o cliente fica registado como "click" (sem acesso à
// área) e é escrito um aviso no log: nunca se dá acesso por engano.
// Membros "click" ficam registados (para comissão) mas sem login nem acesso.

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { enviarEmail, esc, molde } from "../_shared/email.ts";

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

/** "9" ou "09:00" → "09:00"; vazio → "[HOUR]" (nunca se inventa uma hora). */
function horaTexto(): string {
  const h = (Deno.env.get("HORA_ENVIO") ?? "").trim();
  const m = h.match(/^(\d{1,2})(?::(\d{2}))?$/);
  return m ? `${m[1].padStart(2, "0")}:${m[2] ?? "00"}` : "[HOUR]";
}
const HORA = horaTexto();

type Origem = "direto" | "click";
type Estado = "ativo" | "cancelado" | "em_atraso";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const assinatura = req.headers.get("stripe-signature") ?? "";
  const corpo = await req.text();

  // Verificação da assinatura: sem segredo configurado nada é aceite.
  const segredo = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!segredo) return new Response("STRIPE_WEBHOOK_SECRET em falta", { status: 500 });
  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(corpo, assinatura, segredo, undefined, cryptoProvider);
  } catch (e) {
    return new Response(`Assinatura inválida: ${(e as Error).message}`, { status: 400 });
  }

  // Idempotência: o Stripe reenvia eventos; cada id só é processado uma vez.
  const { error: dup } = await admin.from("stripe_eventos").insert({ id: evento.id, tipo: evento.type });
  if (dup) {
    if (dup.code === "23505") return json({ ok: true, repetido: true });
    return json({ erro: dup.message }, 500);
  }

  try {
    switch (evento.type) {
      case "checkout.session.completed":
        await aoCompletarCheckout(evento.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
        await aoCriarSubscricao(evento.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await aoAlterarSubscricao(evento.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
        await aoPagarFatura(evento.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await aoFalharPagamento(evento.data.object as Stripe.Invoice);
        break;
      default:
        // outros eventos são ignorados de propósito
    }
    return json({ ok: true });
  } catch (e) {
    console.error(evento.type, evento.id, (e as Error).message);
    // Liberta o id para o Stripe voltar a tentar.
    await admin.from("stripe_eventos").delete().eq("id", evento.id);
    return json({ erro: (e as Error).message }, 500);
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

async function precosDaSessao(s: Stripe.Checkout.Session): Promise<string[]> {
  try {
    const linhas = await stripe.checkout.sessions.listLineItems(s.id, { limit: 20 });
    return linhas.data.map((l) => l.price?.id ?? "").filter(Boolean);
  } catch (e) {
    console.warn(`sem linhas para a sessão ${s.id}: ${(e as Error).message}`);
    return [];
  }
}

async function origemDaSessao(s: Stripe.Checkout.Session): Promise<Origem> {
  const m = origemDeMetadata(s.metadata);
  if (m) return m;
  const porPreco = origemDePrecos(await precosDaSessao(s));
  if (porPreco) return porPreco;
  if (LINK_DIRETO && s.payment_link === LINK_DIRETO) return "direto";
  if (typeof s.subscription === "string") {
    const sub = await stripe.subscriptions.retrieve(s.subscription);
    const o = origemDeMetadata(sub.metadata);
    if (o) return o;
  }
  console.warn(`origem desconhecida na sessão ${s.id}: registado como "click", sem acesso à área`);
  return "click";
}

function origemDaSubscricao(sub: Stripe.Subscription): Origem {
  const m = origemDeMetadata(sub.metadata);
  if (m) return m;
  const porPreco = origemDePrecos(sub.items.data.map((i) => i.price?.id ?? ""));
  if (porPreco) return porPreco;
  console.warn(`origem desconhecida na subscrição ${sub.id}: registado como "click", sem acesso à área`);
  return "click";
}

// ───────────────────────────────────────────────────────────────────────
// Registo do subscritor

/**
 * Garante a linha em public.subscritores. Para "direto" cria o utilizador de
 * Auth e envia as boas-vindas com magic link, mas só na primeira vez (quando a
 * linha ainda não tinha user_id): assim os eventos podem chegar por qualquer
 * ordem sem duplicar e-mails.
 */
async function garantirSubscritor(email: string, origem: Origem, customer: string | null, subscription: string | null, estado: Estado = "ativo") {
  const atual = await admin.from("subscritores").select("id,user_id,origem").eq("email", email).maybeSingle();
  if (atual.error) throw atual.error;

  const registo: Record<string, unknown> = { email, origem, estado, stripe_customer_id: customer, stripe_subscription_id: subscription };
  let linkEntrada: string | null = null;

  if (origem === "direto" && !atual.data?.user_id) {
    const criado = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (criado.error && !/already|exists|registered/i.test(criado.error.message) && criado.error.code !== "email_exists") {
      throw criado.error;
    }
    // Magic link gerado no servidor e enviado pelo Resend (o SMTP do Supabase não é usado).
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: APP_URL } });
    if (link.error) throw link.error;
    registo.user_id = link.data.user?.id ?? criado.data.user?.id ?? null;
    linkEntrada = link.data.properties?.action_link ?? null;
  }

  const { error } = await admin.from("subscritores").upsert(registo, { onConflict: "email" });
  if (error) throw error;

  if (linkEntrada) await enviarBoasVindas(email, linkEntrada);
}

async function aoCompletarCheckout(s: Stripe.Checkout.Session) {
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return;
  const email = (s.customer_details?.email ?? s.customer_email ?? "").trim().toLowerCase();
  if (!email) throw new Error(`sessão ${s.id} sem e-mail`);
  const origem = await origemDaSessao(s);
  const customer = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
  const subscription = typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;
  await garantirSubscritor(email, origem, customer, subscription);
}

async function emailDoCliente(customer: string): Promise<string> {
  const c = await stripe.customers.retrieve(customer);
  if (c.deleted) return "";
  return (c.email ?? "").trim().toLowerCase();
}

async function aoCriarSubscricao(sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  // Se o checkout.session.completed já passou, basta alinhar o estado.
  const existe = await admin.from("subscritores").select("id").or(`stripe_subscription_id.eq.${sub.id},stripe_customer_id.eq.${customer}`).limit(1);
  if (existe.error) throw existe.error;
  if ((existe.data?.length ?? 0) > 0) return aoAlterarSubscricao(sub);

  const email = await emailDoCliente(customer);
  if (!email) { console.warn(`subscrição ${sub.id} sem e-mail no cliente ${customer}`); return; }
  await garantirSubscritor(email, origemDaSubscricao(sub), customer, sub.id, estadoDe(sub.status));
}

function estadoDe(status: Stripe.Subscription.Status): Estado {
  switch (status) {
    case "active":
    case "trialing":
      return "ativo";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "em_atraso";
    default: // canceled, incomplete_expired, paused
      return "cancelado";
  }
}

async function aoAlterarSubscricao(sub: Stripe.Subscription) {
  const estado = estadoDe(sub.status);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let q = await admin.from("subscritores").update({ estado }).eq("stripe_subscription_id", sub.id).select("id");
  if (!q.error && (q.data?.length ?? 0) === 0) {
    q = await admin.from("subscritores").update({ estado, stripe_subscription_id: sub.id }).eq("stripe_customer_id", customer).select("id");
  }
  if (q.error) throw q.error;
  if ((q.data?.length ?? 0) === 0) console.warn(`subscrição ${sub.id} sem subscritor correspondente`);
}

async function aoPagarFatura(inv: Stripe.Invoice) {
  const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  if (!customer) return;
  // Pagamento bom (primeiro ou renovação): quem estava em atraso volta a ativo. Cancelados não voltam por aqui.
  const { error } = await admin.from("subscritores").update({ estado: "ativo" })
    .eq("stripe_customer_id", customer).eq("estado", "em_atraso");
  if (error) throw error;
}

async function aoFalharPagamento(inv: Stripe.Invoice) {
  const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  if (!customer) return;
  const { error } = await admin.from("subscritores").update({ estado: "em_atraso" })
    .eq("stripe_customer_id", customer).eq("estado", "ativo");
  if (error) throw error;
}

// ───────────────────────────────────────────────────────────────────────
// E-mail de boas-vindas (só porta "direto")

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

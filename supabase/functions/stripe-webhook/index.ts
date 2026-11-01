// Webhook do Stripe → cria/atualiza subscritores e envia o e-mail de boas-vindas
// (magic link) aos subscritores da porta "direto".
//
// Eventos tratados: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted, invoice.payment_failed.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Segredos (supabase secrets set): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   STRIPE_PAYMENT_LINK_DIRETO (plink_…), RESEND_API_KEY, EMAIL_FROM, APP_URL,
//   HORA_ENVIO, MAGIC_LINK_MINUTOS. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são
//   injetadas automaticamente pelo Supabase.
//
// Origem do cliente, por esta ordem: metadata.origem da sessão de checkout
// ("direto" | "click"), id do Payment Link direto, metadata.origem da
// subscrição. Sem nenhum destes sinais, o cliente fica registado como "click"
// (sem acesso à área) e é escrito um aviso no log: nunca se dá acesso por engano.

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
const HORA = Deno.env.get("HORA_ENVIO") ?? "[HORA]";
const MINUTOS = Deno.env.get("MAGIC_LINK_MINUTOS") ?? "60";

type Origem = "direto" | "click";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const assinatura = req.headers.get("stripe-signature") ?? "";
  const corpo = await req.text();

  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(
      corpo, assinatura, Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "", undefined, cryptoProvider,
    );
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
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await aoAlterarSubscricao(evento.data.object as Stripe.Subscription);
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

async function detetarOrigem(s: Stripe.Checkout.Session): Promise<Origem> {
  const m = (s.metadata?.origem ?? "").toLowerCase();
  if (m === "direto" || m === "click") return m;
  if (LINK_DIRETO && s.payment_link === LINK_DIRETO) return "direto";
  if (typeof s.subscription === "string") {
    const sub = await stripe.subscriptions.retrieve(s.subscription);
    const o = (sub.metadata?.origem ?? "").toLowerCase();
    if (o === "direto" || o === "click") return o;
  }
  console.warn(`origem desconhecida na sessão ${s.id}: registado como "click", sem acesso à área`);
  return "click";
}

async function aoCompletarCheckout(s: Stripe.Checkout.Session) {
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return;
  const email = (s.customer_details?.email ?? s.customer_email ?? "").trim().toLowerCase();
  if (!email) throw new Error(`sessão ${s.id} sem e-mail`);

  const origem = await detetarOrigem(s);
  const customer = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
  const subscription = typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;

  let user_id: string | null = null;
  let linkEntrada: string | null = null;

  if (origem === "direto") {
    // Cria o utilizador de Auth (sem palavra-passe). Se já existir, segue.
    const criado = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (criado.error && !/already|exists|registered/i.test(criado.error.message) && criado.error.code !== "email_exists") {
      throw criado.error;
    }
    // Magic link gerado no servidor e enviado pelo Resend (o SMTP do Supabase não é usado).
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: APP_URL } });
    if (link.error) throw link.error;
    user_id = link.data.user?.id ?? criado.data.user?.id ?? null;
    linkEntrada = link.data.properties?.action_link ?? null;
  }

  const registo: Record<string, unknown> = {
    email, origem, estado: "ativo",
    stripe_customer_id: customer, stripe_subscription_id: subscription,
  };
  if (user_id) registo.user_id = user_id;
  const { error } = await admin.from("subscritores").upsert(registo, { onConflict: "email" });
  if (error) throw error;

  if (origem === "direto" && linkEntrada) await enviarBoasVindas(email, linkEntrada);
}

function estadoDe(status: Stripe.Subscription.Status): "ativo" | "cancelado" | "em_atraso" {
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

async function aoFalharPagamento(inv: Stripe.Invoice) {
  const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  if (!customer) return;
  const { error } = await admin.from("subscritores").update({ estado: "em_atraso" })
    .eq("stripe_customer_id", customer).eq("estado", "ativo");
  if (error) throw error;
}

async function enviarBoasVindas(email: string, link: string) {
  const texto =
    `Olá! O teu acesso está ativo.\n\n` +
    `Entra na tua área com este link (é só teu e válido por ${MINUTOS} minutos):\n${link}\n\n` +
    `A partir de amanhã recebes aqui, todos os dias às ${HORA}, as coleções do dia.\n\n` +
    `Qualquer dúvida, responde a este email.`;
  const html = molde(
    "O teu acesso está ativo",
    `<p>Olá! O teu acesso está ativo.</p>
     <p>Entra na tua área com este botão (o link é só teu e válido por ${esc(MINUTOS)} minutos):</p>`,
    { texto: "Entrar no ProvenDrop", url: link },
    `A partir de amanhã recebes aqui, todos os dias às ${esc(HORA)}, as coleções do dia. Qualquer dúvida, responde a este email.`,
  );
  await enviarEmail({ to: email, subject: "Bem-vindo ao ProvenDrop: o teu acesso", html, text: texto });
}

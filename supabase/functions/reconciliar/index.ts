// M7 · Reconciliação diária Stripe ↔ base (só leitura).
//
// Chamada pelo pg_cron 1× por dia (06:30 UTC) com x-cron-secret, ou à mão:
//   POST …/reconciliar  com x-cron-secret.
// Compara as subscrições do Stripe (todas, excepto incomplete_expired) com
// public.subscricoes e os acessos derivados em public.subscritores. Não escreve
// nada: devolve o relatório em JSON e envia um alerta por e-mail quando há
// divergências. Com STRIPE_ACCEPT_TEST=1 lê o modo de teste (a chave decide).
//
// Deploy:  supabase functions deploy reconciliar --no-verify-jwt
// Segredos: STRIPE_SECRET_KEY, CRON_SECRET, RESEND_API_KEY, EMAIL_FROM, ALERT_EMAIL/EMAIL_REPLY_TO.

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { cronSecretOk } from "../_shared/auth.ts";
import { idEmail, semSegredos } from "../_shared/log.ts";
import { alertar } from "../_shared/alerta.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-02-24.acacia", // a versão do SDK stripe@17.7.0 (só lê status e customer: igual nas duas formas)
  httpClient: Stripe.createFetchHttpClient(),
});
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const TOLERANCIA_DIAS = 7;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

type Estado = "ativo" | "em_atraso" | "incompleto" | "cancelado";
function estadoDe(status: Stripe.Subscription.Status): Estado {
  switch (status) {
    case "active": case "trialing": return "ativo";
    case "past_due": case "unpaid": return "em_atraso";
    case "incomplete": return "incompleto";
    default: return "cancelado";
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!(await cronSecretOk(req))) return json({ erro: "não autorizado" }, 401);

  try {
    // 1. Stripe: todas as subscrições (paginação), excepto as expiradas sem pagamento.
    const noStripe = new Map<string, { estado: Estado; customer: string; status: string }>();
    for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.customer"] })) {
      if (sub.status === "incomplete_expired") continue;
      noStripe.set(sub.id, { estado: estadoDe(sub.status), customer: typeof sub.customer === "string" ? sub.customer : sub.customer.id, status: sub.status });
    }

    // 2. Base: subscricoes e subscritores.
    const subs = await admin.from("subscricoes").select("stripe_subscription_id,email,origem,estado");
    if (subs.error) throw subs.error;
    const naBase = new Map((subs.data ?? []).map((s) => [s.stripe_subscription_id, s]));
    const membros = await admin.from("subscritores").select("email,origem,estado,user_id,bloqueado_em,em_atraso_desde,boas_vindas_em");
    if (membros.error) throw membros.error;

    const divergencias: string[] = [];
    // a) No Stripe e não na base (ou com estado diferente).
    for (const [id, s] of noStripe) {
      const b = naBase.get(id);
      if (!b) { divergencias.push(`• ${id}: existe no Stripe (${s.status}) e não em subscricoes`); continue; }
      if (b.estado !== s.estado) divergencias.push(`• ${id}: Stripe ${s.status} (${s.estado}) ≠ base ${b.estado}`);
    }
    // b) Na base e não no Stripe (apagada no Stripe, ou de outro modo/conta).
    for (const [id, b] of naBase) {
      if (!noStripe.has(id) && b.estado !== "cancelado") divergencias.push(`• ${id}: na base como ${b.estado} mas não existe no Stripe deste modo`);
    }
    // c) Acesso sem subscrição direto viva.
    const comAcesso = (membros.data ?? []).filter((m) => m.origem === "direto" && !m.bloqueado_em &&
      (m.estado === "ativo" || (m.estado === "em_atraso" && m.em_atraso_desde && Date.now() - new Date(m.em_atraso_desde).getTime() < TOLERANCIA_DIAS * 864e5)));
    for (const m of comAcesso) {
      const viva = (subs.data ?? []).some((s) => s.email === m.email && s.origem === "direto" && (s.estado === "ativo" || s.estado === "em_atraso"));
      if (!viva) divergencias.push(`• ${await idEmail(m.email)}: tem acesso sem subscrição direto ativa/em atraso em subscricoes`);
      if (!m.boas_vindas_em && m.estado === "ativo") divergencias.push(`• ${await idEmail(m.email)}: ativo sem boas-vindas enviadas`);
    }

    const resumo = {
      ok: true, modo: (Deno.env.get("STRIPE_ACCEPT_TEST") ?? "") === "1" ? "teste" : "real",
      stripe: noStripe.size, base: naBase.size, membros_com_acesso: comAcesso.length, divergencias: divergencias.length,
      detalhe: divergencias,
    };
    if (divergencias.length) {
      await alertar(`Reconciliação: ${divergencias.length} divergência(s) Stripe ↔ base`, [
        `Modo ${resumo.modo}. Stripe: ${noStripe.size} subscrições; base: ${naBase.size}; membros com acesso: ${comAcesso.length}.`,
        ...divergencias,
        "Nada foi alterado. Ver docs/PAGAMENTOS.md (M7) para o procedimento.",
      ]);
    }
    console.log(`reconciliação: ${JSON.stringify({ ...resumo, detalhe: undefined })}`);
    return json(resumo);
  } catch (e) {
    console.error("reconciliar:", semSegredos((e as Error).message));
    return json({ erro: "erro interno" }, 500);
  }
});

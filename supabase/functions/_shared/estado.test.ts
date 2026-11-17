// deno test supabase/functions/_shared/estado.test.ts
// Estado da base a partir da subscrição do Stripe (2026-11-16): depois de um teste grátis, "active" só dá acesso com a
// fatura a seguir ao teste paga. Casos tirados do Stripe de teste (relógios de teste, 2026-11-16).
import { assertEquals } from "jsr:@std/assert@1";
import { estadoDaSubscricao, faturaPorCobrar, precisaDeFaturas } from "./estado.ts";

const T = 1_800_000_000;                 // fim do teste
const criacao = { status: "paid", total: 0, created: T - 5 * 86400, billing_reason: "subscription_create" };
const ciclo = (status: string, created = T, total = 1500) => ({ status, total, created, billing_reason: "subscription_cycle" });

Deno.test("sem teste (plano Platform, Start my plan): igual a antes", () => {
  assertEquals(estadoDaSubscricao({ status: "active", trialEnd: null, agora: T, faturas: [] }), "ativo");
  assertEquals(estadoDaSubscricao({ status: "past_due", trialEnd: null, agora: T, faturas: [] }), "em_atraso");
  assertEquals(estadoDaSubscricao({ status: "incomplete", trialEnd: null, agora: T, faturas: [] }), "incompleto");
  assertEquals(estadoDaSubscricao({ status: "canceled", trialEnd: null, agora: T, faturas: [] }), "cancelado");
});

Deno.test("em teste: teste", () => {
  assertEquals(estadoDaSubscricao({ status: "trialing", trialEnd: T, agora: T - 60, faturas: [criacao] }), "teste");
});

Deno.test("fim do teste SEM cartão: o Stripe põe 'active' por instantes, sem fatura do ciclo → sem acesso", () => {
  assertEquals(estadoDaSubscricao({ status: "active", trialEnd: T, agora: T + 2, faturas: [criacao] }), "incompleto");
});

Deno.test("fim do teste COM cartão: fatura em rascunho (1 hora no Stripe) → sem acesso até estar paga", () => {
  assertEquals(estadoDaSubscricao({ status: "active", trialEnd: T, agora: T + 60, faturas: [ciclo("draft"), criacao] }), "incompleto");
  assertEquals(estadoDaSubscricao({ status: "active", trialEnd: T, agora: T + 60, faturas: [ciclo("open"), criacao] }), "incompleto");
  assertEquals(estadoDaSubscricao({ status: "active", trialEnd: T, agora: T + 3600, faturas: [ciclo("paid"), criacao] }), "ativo");
});

Deno.test("primeira cobrança depois do teste falhou (past_due): sem acesso, nada de 7 dias de tolerância", () => {
  assertEquals(estadoDaSubscricao({ status: "past_due", trialEnd: T, agora: T + 7200, faturas: [ciclo("open"), criacao] }), "incompleto");
});

Deno.test("meses depois: renovação em rascunho ou em atraso segue as regras normais (já houve uma paga)", () => {
  const pagas = [ciclo("paid", T), ciclo("paid", T + 30 * 86400)];
  assertEquals(estadoDaSubscricao({ status: "active", trialEnd: T, agora: T + 60 * 86400, faturas: [ciclo("draft", T + 60 * 86400), ...pagas] }), "ativo");
  assertEquals(estadoDaSubscricao({ status: "past_due", trialEnd: T, agora: T + 61 * 86400, faturas: [ciclo("open", T + 60 * 86400), ...pagas] }), "em_atraso");
});

Deno.test("Start my plan now (trial_end = now): a fatura criada nesse instante, paga, dá acesso", () => {
  assertEquals(estadoDaSubscricao({ status: "active", trialEnd: T, agora: T + 5, faturas: [ciclo("paid", T), criacao] }), "ativo");
});

Deno.test("só é preciso ler as faturas depois do fim de um teste e com a subscrição a cobrar", () => {
  assertEquals(precisaDeFaturas({ status: "active", trialEnd: T, agora: T + 1 }), true);
  assertEquals(precisaDeFaturas({ status: "past_due", trialEnd: T, agora: T + 1 }), true);
  assertEquals(precisaDeFaturas({ status: "active", trialEnd: null, agora: T }), false);
  assertEquals(precisaDeFaturas({ status: "trialing", trialEnd: T, agora: T - 1 }), false);
  assertEquals(precisaDeFaturas({ status: "canceled", trialEnd: T, agora: T + 1 }), false);
});

Deno.test("fatura a cobrar já: a fatura do ciclo depois do teste ainda em rascunho", () => {
  assertEquals(faturaPorCobrar({ trialEnd: T, faturas: [{ ...ciclo("draft"), id: "in_1" }, { ...criacao, id: "in_0" }] }), "in_1");
  assertEquals(faturaPorCobrar({ trialEnd: T, faturas: [{ ...ciclo("paid"), id: "in_1" }] }), null);
  assertEquals(faturaPorCobrar({ trialEnd: T, faturas: [{ ...criacao, id: "in_0" }] }), null);
  assertEquals(faturaPorCobrar({ trialEnd: null, faturas: [{ ...ciclo("draft"), id: "in_1" }] }), null);
});

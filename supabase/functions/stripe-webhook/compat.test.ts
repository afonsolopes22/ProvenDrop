// Testes de compat.ts com fixtures das duas versões da API do Stripe:
// "acacia" (2024-12-18, forma antiga) e "endive" (2026-10-28, forma nova; igual
// à basil 2025-03-31 nestes campos). Correr com:  deno test supabase/functions/stripe-webhook/compat.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  chargeDe, clienteDe, fimDoPeriodo, motivoBloqueio, origemDaSessao, origemDaSubscricao, origemDeMetadata, origemDePrecos,
  prazoDaDisputa, precoDaLinha, precosDasLinhas, reembolsoTotal, subscricaoDaInvoice, valorTexto,
} from "./compat.ts";

const DIRETO = "price_1UYaVjJPREpzETp6wboEOplv";
const CLICK = "price_1UYaWLJPREpzETp6beErOUxC";
const ADESAO = "price_1UYaXiJPREpzETp6GoaPRcuA";

// ── fixtures: invoice ────────────────────────────────────────────────
const invoiceAcacia = { id: "in_1", object: "invoice", subscription: "sub_acacia", lines: { data: [{ price: { id: DIRETO } }, { price: { id: ADESAO } }] } };
const invoiceAcaciaExpandida = { id: "in_2", object: "invoice", subscription: { id: "sub_acacia_exp", object: "subscription" } };
const invoiceEndive = {
  id: "in_3", object: "invoice",
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_endive", metadata: { origem: "direto" } } },
  lines: { data: [{ pricing: { type: "price_details", price_details: { price: DIRETO, product: "prod_x" } } }, { pricing: { price_details: { price: ADESAO } } }] },
};
const invoiceEndiveExpandida = { id: "in_4", parent: { subscription_details: { subscription: { id: "sub_endive_exp" } } } };
const invoiceAvulsa = { id: "in_5", object: "invoice", parent: null, lines: { data: [] } };

Deno.test("invoice: subscrição na forma antiga (string e expandida)", () => {
  assertEquals(subscricaoDaInvoice(invoiceAcacia), "sub_acacia");
  assertEquals(subscricaoDaInvoice(invoiceAcaciaExpandida), "sub_acacia_exp");
});
Deno.test("invoice: subscrição na forma nova (parent.subscription_details)", () => {
  assertEquals(subscricaoDaInvoice(invoiceEndive), "sub_endive");
  assertEquals(subscricaoDaInvoice(invoiceEndiveExpandida), "sub_endive_exp");
});
Deno.test("invoice: avulsa, vazia ou malformada → null", () => {
  assertEquals(subscricaoDaInvoice(invoiceAvulsa), null);
  assertEquals(subscricaoDaInvoice({ subscription: "" }), null);
  assertEquals(subscricaoDaInvoice(null), null);
  assertEquals(subscricaoDaInvoice("sub_x"), null);
});

// ── fixtures: linhas ─────────────────────────────────────────────────
Deno.test("linhas: price_id na forma antiga (line.price.id) e nova (line.pricing.price_details.price)", () => {
  assertEquals(precoDaLinha(invoiceAcacia.lines.data[0]), DIRETO);
  assertEquals(precoDaLinha(invoiceEndive.lines.data[0]), DIRETO);
  assertEquals(precoDaLinha({ price: null, pricing: null }), null);
  assertEquals(precosDasLinhas(invoiceAcacia.lines), [DIRETO, ADESAO]);
  assertEquals(precosDasLinhas(invoiceEndive.lines), [DIRETO, ADESAO]);
  assertEquals(precosDasLinhas(invoiceEndive.lines.data), [DIRETO, ADESAO]); // lista direta (listLineItems().data)
  assertEquals(precosDasLinhas({ data: [{ price: { id: DIRETO } }, { price: { id: DIRETO } }] }), [DIRETO]); // sem repetidos
  assertEquals(precosDasLinhas(undefined), []);
});

// ── fixtures: subscription ───────────────────────────────────────────
const subAcacia = {
  id: "sub_a", object: "subscription", status: "active", current_period_end: 1_767_225_600, cancel_at_period_end: true,
  metadata: {}, items: { data: [{ price: { id: CLICK } }] },
};
const subEndive = {
  id: "sub_e", object: "subscription", status: "active", cancel_at_period_end: true,
  metadata: { origem: "Direto" },
  items: { data: [{ current_period_end: 1_769_904_000, current_period_start: 1_767_225_600, price: { id: DIRETO } }] },
};
const subEndiveSemMetadata = { id: "sub_f", metadata: {}, items: { data: [{ current_period_end: 1_769_904_000, pricing: { price_details: { price: CLICK } } }] } };

Deno.test("subscription: fim do período no topo (antiga) ou no primeiro item (nova)", () => {
  assertEquals(fimDoPeriodo(subAcacia), 1_767_225_600);
  assertEquals(fimDoPeriodo(subEndive), 1_769_904_000);
  assertEquals(fimDoPeriodo({ items: { data: [] } }), null);
  assertEquals(fimDoPeriodo(null), null);
});
Deno.test("origem: metadata (qualquer capitalização) ganha; senão price_id dos items nas duas formas", () => {
  assertEquals(origemDeMetadata({ origem: "click" }), "click");
  assertEquals(origemDeMetadata({ origem: " DIRETO " }), "direto");
  assertEquals(origemDeMetadata({ origem: "outra" }), null);
  assertEquals(origemDeMetadata(undefined), null);
  assertEquals(origemDaSubscricao(subAcacia, DIRETO, CLICK), "click");         // sem metadata → price CLICK (forma antiga)
  assertEquals(origemDaSubscricao(subEndive, DIRETO, CLICK), "direto");        // metadata
  assertEquals(origemDaSubscricao(subEndiveSemMetadata, DIRETO, CLICK), "click"); // price na forma nova
  assertEquals(origemDaSubscricao(subEndiveSemMetadata, DIRETO, ""), null);    // price desconhecido
});
Deno.test("origem por preços: direto ganha ao click quando os dois aparecem; desconhecido → null", () => {
  assertEquals(origemDePrecos([ADESAO, DIRETO], DIRETO, CLICK), "direto");
  assertEquals(origemDePrecos([CLICK, DIRETO], DIRETO, CLICK), "direto");
  assertEquals(origemDePrecos([ADESAO], DIRETO, CLICK), null);
  assertEquals(origemDePrecos([DIRETO], "", ""), null);
});

// ── fixtures: checkout session ───────────────────────────────────────
const sessaoDireto = { id: "cs_1", metadata: { origem: "direto" }, subscription: "sub_x" };
const sessaoSemMetadata = { id: "cs_2", metadata: {}, subscription: "sub_y" };
const sessaoSubExpandida = { id: "cs_3", metadata: {}, subscription: { id: "sub_z", metadata: { origem: "click" } } };

// ── fixtures: charge.refunded e charge.dispute.created (A4, revogam o acesso) ──
const chargeTotal = { id: "ch_1", object: "charge", amount: 4000, amount_refunded: 4000, currency: "eur", customer: "cus_a", refunded: true };
const chargeParcial = { id: "ch_2", object: "charge", amount: 4000, amount_refunded: 1500, currency: "eur", customer: { id: "cus_b", object: "customer" }, refunded: false };
const chargeSemCliente = { id: "ch_3", amount: 1500, amount_refunded: 1500, currency: "eur", customer: null };
const disputaAcacia = { id: "dp_1", object: "dispute", amount: 4000, currency: "eur", charge: "ch_1", customer: null, reason: "fraudulent", status: "needs_response", evidence_details: { due_by: 1_768_780_800 } };
const disputaEndive = { id: "dp_2", object: "dispute", amount: 1500, currency: "eur", charge: { id: "ch_9", customer: "cus_z" }, evidence_details: { due_by: null } };

Deno.test("charge: reembolso total só quando amount_refunded >= amount (parcial → false)", () => {
  assertEquals(reembolsoTotal(chargeTotal), true);
  assertEquals(reembolsoTotal(chargeParcial), false);
  assertEquals(reembolsoTotal(chargeSemCliente), true);
  assertEquals(reembolsoTotal({ amount: 0, amount_refunded: 0 }), false);
  assertEquals(reembolsoTotal(null), false);
});
Deno.test("charge/disputa: customer e charge nas duas formas (string e expandida)", () => {
  assertEquals(clienteDe(chargeTotal), "cus_a");
  assertEquals(clienteDe(chargeParcial), "cus_b");
  assertEquals(clienteDe(chargeSemCliente), null);
  assertEquals(chargeDe(disputaAcacia), "ch_1");
  assertEquals(chargeDe(disputaEndive), "ch_9");
  assertEquals(clienteDe(disputaAcacia), null); // a disputa não traz customer: vai-se à charge
});
Deno.test("disputa: prazo de resposta e motivo de bloqueio", () => {
  assertEquals(prazoDaDisputa(disputaAcacia), "2026-01-19");
  assertEquals(prazoDaDisputa(disputaEndive), null);
  assertEquals(motivoBloqueio("disputa", "dp_1"), "disputa dp_1");
  assertEquals(motivoBloqueio("reembolso", "ch_1"), "reembolso ch_1");
  assertEquals(valorTexto(4000, "eur"), "40.00 EUR");
});

Deno.test("checkout session: metadata da sessão → metadata da subscrição expandida → price_ids das linhas", () => {
  assertEquals(origemDaSessao(sessaoDireto, [], DIRETO, CLICK), "direto");
  assertEquals(origemDaSessao(sessaoSubExpandida, [], DIRETO, CLICK), "click");
  assertEquals(origemDaSessao(sessaoSemMetadata, invoiceEndive.lines.data, DIRETO, CLICK), "direto"); // linhas na forma nova
  assertEquals(origemDaSessao(sessaoSemMetadata, invoiceAcacia.lines.data, DIRETO, CLICK), "direto"); // linhas na forma antiga
  assertEquals(origemDaSessao(sessaoSemMetadata, [{ price: { id: ADESAO } }], DIRETO, CLICK), null);
});

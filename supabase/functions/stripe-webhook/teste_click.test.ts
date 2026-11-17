// deno test supabase/functions/stripe-webhook/teste_click.test.ts
// Teste grátis do plano Click (2026-11-14): normalização, decisão e "um teste por pessoa", com uma base em memória
// que respeita a chave única (tipo, valor) de testes_click_usados.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { avaliarCartaoAdicionado, avaliarTesteClick, decidirTeste, fimDoTesteSemCartao, fimDaOferta, ofertaTerminou, TRIAL_ATE_PADRAO, type DepsTesteClick, normalizarLoja, normalizarTelefone } from "./teste_click.ts";
import { temAcesso } from "../_shared/acesso.ts";

Deno.test("telefone: só dígitos, com indicativo; curto demais não conta", () => {
  assertEquals(normalizarTelefone("+351 912 345 678"), "351912345678");
  assertEquals(normalizarTelefone("+351-912-345-678"), "351912345678");
  assertEquals(normalizarTelefone("00351912345678"), "351912345678");
  assertEquals(normalizarTelefone("(+44) 7700 900123"), "447700900123");
  assertEquals(normalizarTelefone("123"), null);
  assertEquals(normalizarTelefone(""), null);
  assertEquals(normalizarTelefone(null), null);
});

Deno.test("loja: minúsculas, sem espaços, pontuação nem acentos; curta demais não conta", () => {
  assertEquals(normalizarLoja("Loja da Ana!"), "lojadaana");
  assertEquals(normalizarLoja("  LOJA-da.ANA  "), "lojadaana");
  assertEquals(normalizarLoja("Café & Ç.ª"), "cafeca");
  assertEquals(normalizarLoja("www.Loja-Ana.pt"), "wwwlojaanapt");
  assertEquals(normalizarLoja("ab"), null);
  assertEquals(normalizarLoja("!!!"), null);
  assertEquals(normalizarLoja(null), null);
});

Deno.test("decisão: pré-pago ou repetido → sem teste; senão mantém o teste", () => {
  assertEquals(decidirTeste({ funding: "credit", repetidos: [] }), { teste: true, motivo: null });
  assertEquals(decidirTeste({ funding: "debit", repetidos: [] }), { teste: true, motivo: null });
  assertEquals(decidirTeste({ funding: "prepaid", repetidos: [] }), { teste: false, motivo: "prepaid card" });
  assertEquals(decidirTeste({ funding: "credit", repetidos: ["telefone"] }), { teste: false, motivo: "repeat: phone" });
  assertEquals(decidirTeste({ funding: "credit", repetidos: ["cartao", "loja"] }), { teste: false, motivo: "repeat: card, store" });
  assertEquals(decidirTeste({ funding: "prepaid", repetidos: ["loja"] }), { teste: false, motivo: "prepaid card; repeat: store" });
});

/** testes_click_usados em memória: insert … on conflict (tipo, valor) do nothing, depois lê quem é o dono. */
function base() {
  const usados = new Map<string, { email: string; sub: string }>();
  const fim: string[] = [], cancelados: string[] = [], alertas: string[] = [], clientes: string[] = [];
  const guardado: Record<string, unknown> = {};
  let falharCobranca = false;
  const deps: DepsTesteClick = {
    reclamar: async (valores, email, sub) => {
      for (const v of valores) { const k = `${v.tipo}|${v.valor}`; if (!usados.has(k)) usados.set(k, { email, sub }); }
      return valores.filter((v) => usados.get(`${v.tipo}|${v.valor}`)!.sub !== sub).map((v) => v.tipo);
    },
    acabarTeste: async (sub) => { if (falharCobranca) throw new Error("card_declined"); fim.push(sub); },
    cancelar: async (sub) => { cancelados.push(sub); },
    guardar: async (_e, d) => { Object.assign(guardado, d); },
    alertar: async (assunto) => { alertas.push(assunto); return true; },
    avisarTesteUsado: async (email) => { clientes.push(email); return true; },
  };
  return { deps, usados, fim, cancelados, alertas, clientes, guardado, falhar: () => { falharCobranca = true; } };
}
const CARTAO = { fingerprint: "fpA", funding: "credit", last4: "4242" };
const compra = (sub: string, o: Partial<{ email: string; telefone: string; loja: string; cartao: typeof CARTAO | null }> = {}) => ({
  email: o.email ?? "a@x.pt", sub, codigo: "PD-AAAAAA", emTeste: true, telefone: o.telefone ?? "+351 912 345 678", loja: o.loja ?? "Loja da Ana", cartao: o.cartao === undefined ? CARTAO : o.cartao,
});

Deno.test("primeira compra com teste: mantém o teste e guarda os dados normalizados", async () => {
  const b = base();
  const r = await avaliarTesteClick(b.deps, compra("sub_1"));
  assertEquals(r.teste, true);
  assertEquals(b.fim, []);
  assertEquals(b.guardado, { cartao_ultimos4: "4242", cartao_impressao: "fpA", cartao_tipo: "credit", telefone_norm: "351912345678", loja_norm: "lojadaana", teste_repetido: false, teste_motivo: null });
  assertEquals(b.usados.size, 3);
});

Deno.test("o mesmo evento outra vez (mesma subscrição) não conta como repetição", async () => {
  const b = base();
  await avaliarTesteClick(b.deps, compra("sub_1"));
  const r = await avaliarTesteClick(b.deps, compra("sub_1"));
  assertEquals(r.teste, true);
  assertEquals(b.fim, []);
});

Deno.test("segunda compra com o mesmo telefone (outro cartão, outra loja) → acaba o teste e cobra logo", async () => {
  const b = base();
  await avaliarTesteClick(b.deps, compra("sub_1"));
  const r = await avaliarTesteClick(b.deps, compra("sub_2", { email: "b@x.pt", loja: "Outra Loja", cartao: { fingerprint: "fpB", funding: "credit", last4: "1111" } }));
  assertEquals(r.teste, false);
  assertEquals(r.motivo, "repeat: phone");
  assertEquals(b.fim, ["sub_2"]);
  assertEquals(b.guardado.teste_repetido, true);
  assertEquals(b.guardado.teste_motivo, "repeat: phone");
});

Deno.test("loja escrita de outra maneira (maiúsculas, pontuação) também é repetição", async () => {
  const b = base();
  await avaliarTesteClick(b.deps, compra("sub_1"));
  const r = await avaliarTesteClick(b.deps, compra("sub_2", { telefone: "+44 7700 900123", loja: "LOJA-DA-ANA.", cartao: { fingerprint: "fpC", funding: "debit", last4: "5556" } }));
  assertEquals(r.motivo, "repeat: store");
});

Deno.test("cartão pré-pago → sem teste, cobra logo", async () => {
  const b = base();
  const r = await avaliarTesteClick(b.deps, compra("sub_1", { cartao: { fingerprint: "fpP", funding: "prepaid", last4: "5100" } }));
  assertEquals(r.teste, false);
  assertEquals(r.motivo, "prepaid card");
  assertEquals(b.fim, ["sub_1"]);
});

Deno.test("cobrança recusada ao acabar o teste → subscrição cancelada, sem acesso grátis, alerta", async () => {
  const b = base();
  await avaliarTesteClick(b.deps, compra("sub_1"));
  b.falhar();
  const r = await avaliarTesteClick(b.deps, compra("sub_2", { email: "b@x.pt", cartao: { fingerprint: "fpA", funding: "credit", last4: "4242" } }));
  assertEquals(r.teste, false);
  assertEquals(r.cobrado, false);
  assertEquals(b.cancelados, ["sub_2"]);
  assert(b.alertas.some((a) => /payment failed/i.test(a)));
});

Deno.test("compra sem teste (link antigo) → não reclama nada nem mexe na subscrição", async () => {
  const b = base();
  const r = await avaliarTesteClick(b.deps, { ...compra("sub_1"), emTeste: false });
  assertEquals(r.teste, false);
  assertEquals(b.usados.size, 0);
  assertEquals(b.fim, []);
});

Deno.test("dados curtos ou vazios nunca coincidem (não reclamam)", async () => {
  const b = base();
  await avaliarTesteClick(b.deps, compra("sub_1", { telefone: "12", loja: "ab", cartao: null }));
  assertEquals(b.usados.size, 0);
  const r = await avaliarTesteClick(b.deps, compra("sub_2", { telefone: "12", loja: "ab", cartao: null }));
  assertEquals(r.teste, true);
});

Deno.test("acesso: Click validado em 'teste' tem acesso; em 'teste' mas pendente ou recusado não", () => {
  const s = { origem: "click", estado: "teste", estado_click: "validado", bloqueado_em: null, em_atraso_desde: null };
  assert(temAcesso(s));
  assert(!temAcesso({ ...s, estado_click: "pendente" }));
  assert(!temAcesso({ ...s, estado_click: "recusado" }));
  assert(!temAcesso({ ...s, bloqueado_em: "2026-11-14T10:00:00Z" }));
});

// Promoção de lançamento: só há teste para subscrições criadas até TRIAL_ATE (2026-11-20 23:59, Lisboa = UTC).
Deno.test("fim da oferta: por omissão 2026-11-20T23:59:00Z; valor inválido usa o de omissão", () => {
  assertEquals(TRIAL_ATE_PADRAO, "2026-11-20T23:59:00+00:00");
  assertEquals(fimDaOferta(undefined), Date.parse("2026-11-20T23:59:00Z"));
  assertEquals(fimDaOferta("  "), Date.parse("2026-11-20T23:59:00Z"));
  assertEquals(fimDaOferta("lixo"), Date.parse("2026-11-20T23:59:00Z"));
  assertEquals(fimDaOferta("2026-12-01T00:00:00+00:00"), Date.parse("2026-12-01T00:00:00Z"));
});

Deno.test("ofertaTerminou: até às 23:59:00 ainda conta; depois não", () => {
  const ate = fimDaOferta(undefined);
  assertEquals(ofertaTerminou(Date.parse("2026-11-20T23:58:59Z"), ate), false);
  assertEquals(ofertaTerminou(Date.parse("2026-11-20T23:59:00Z"), ate), false);
  assertEquals(ofertaTerminou(Date.parse("2026-11-20T23:59:01Z"), ate), true);
  assertEquals(ofertaTerminou(Date.parse("2026-11-21T10:00:00Z"), ate), true);
});

Deno.test("compra nova em trialing depois da oferta → acaba o teste e cobra logo, sem gastar o teste da pessoa", async () => {
  const b = base();
  const r = await avaliarTesteClick(b.deps, { ...compra("sub_9"), ofertaTerminou: true });
  assertEquals(r, { teste: false, motivo: "trial offer ended", cobrado: true, semCartao: false });
  assertEquals(b.fim, ["sub_9"]);
  assertEquals(b.usados.size, 0);
  assertEquals(b.guardado.teste_repetido, false);
  assertEquals(b.guardado.teste_motivo, "trial offer ended");
  assertEquals(b.guardado.telefone_norm, "351912345678");
});

Deno.test("depois da oferta, se a cobrança falhar → cancela e alerta", async () => {
  const b = base(); b.falhar();
  const r = await avaliarTesteClick(b.deps, { ...compra("sub_9"), ofertaTerminou: true });
  assertEquals(r, { teste: false, motivo: "trial offer ended", cobrado: false, semCartao: false });
  assertEquals(b.cancelados, ["sub_9"]);
  assertEquals(b.alertas.length, 1);
});

Deno.test("dentro do prazo (ofertaTerminou false) continua como antes", async () => {
  const b = base();
  const r = await avaliarTesteClick(b.deps, { ...compra("sub_1"), ofertaTerminou: false });
  assertEquals(r.teste, true);
  assertEquals(b.fim, []);
});

// ── Teste SEM cartão (2026-11-16): o checkout já não pede cartão (payment_method_collection = if_required).
const SEM = { cartao: null };

Deno.test("sem cartão, primeira compra: mantém o teste e reclama telefone e loja", async () => {
  const b = base();
  const r = await avaliarTesteClick(b.deps, compra("sub_1", SEM));
  assertEquals(r, { teste: true, motivo: null, cobrado: null, semCartao: true });
  assertEquals([...b.usados.keys()].sort(), ["loja|lojadaana", "telefone|351912345678"]);
  assertEquals(b.guardado.cartao_ultimos4, null);
});

Deno.test("sem cartão, mesmo telefone: não tenta cobrar, cancela, alerta e avisa o cliente", async () => {
  const b = base();
  await avaliarTesteClick(b.deps, compra("sub_1", SEM));
  const r = await avaliarTesteClick(b.deps, compra("sub_2", { ...SEM, email: "b@x.pt", loja: "Outra Loja" }));
  assertEquals(r, { teste: false, motivo: "repeat: phone", cobrado: false, semCartao: true });
  assertEquals(b.fim, []);
  assertEquals(b.cancelados, ["sub_2"]);
  assertEquals(b.alertas.length, 1);
  assertEquals(b.alertas[0].startsWith("Click free trial already used, no card"), true);
  assertEquals(b.clientes, ["b@x.pt"]);
  assertEquals(b.guardado.teste_repetido, true);
});

Deno.test("sem cartão, mesma loja escrita de outra maneira: também cancela", async () => {
  const b = base();
  await avaliarTesteClick(b.deps, compra("sub_1", SEM));
  const r = await avaliarTesteClick(b.deps, compra("sub_2", { ...SEM, email: "b@x.pt", telefone: "+351 933 333 333", loja: "LOJA da ana!" }));
  assertEquals(r.motivo, "repeat: store");
  assertEquals(b.cancelados, ["sub_2"]);
});

Deno.test("sem cartão depois do fim da oferta: cancela sem tentar cobrar", async () => {
  const b = base();
  const r = await avaliarTesteClick(b.deps, { ...compra("sub_9", SEM), ofertaTerminou: true });
  assertEquals(r, { teste: false, motivo: "trial offer ended", cobrado: false, semCartao: true });
  assertEquals(b.fim, []);
  assertEquals(b.cancelados, ["sub_9"]);
});

Deno.test("com cartão continua como antes (semCartao false)", async () => {
  const b = base();
  const r = await avaliarTesteClick(b.deps, compra("sub_1"));
  assertEquals(r, { teste: true, motivo: null, cobrado: null, semCartao: false });
});

// ── Cartão adicionado a meio do teste (Checkout em modo setup)
const NOVO = { fingerprint: "fpNovo", funding: "credit", last4: "4444" };

Deno.test("cartão adicionado: guarda os dados, reclama o cartão e mantém o teste", async () => {
  const b = base();
  await avaliarTesteClick(b.deps, compra("sub_1", SEM));
  const r = await avaliarCartaoAdicionado(b.deps, { email: "a@x.pt", sub: "sub_1", codigo: "PD-AAAAAA", cartao: NOVO });
  assertEquals(r, { teste: true, motivo: null, cobrado: null });
  assertEquals(b.guardado.cartao_ultimos4, "4444");
  assertEquals(b.guardado.cartao_impressao, "fpNovo");
  assertEquals(b.usados.has("cartao|fpNovo"), true);
  assertEquals(b.fim, []);
});

Deno.test("cartão adicionado que já teve teste noutra subscrição → acaba o teste e cobra", async () => {
  const b = base();
  await avaliarTesteClick(b.deps, compra("sub_1", { cartao: NOVO }));
  await avaliarTesteClick(b.deps, compra("sub_2", { ...SEM, email: "b@x.pt", telefone: "+351 933 333 333", loja: "Outra" }));
  const r = await avaliarCartaoAdicionado(b.deps, { email: "b@x.pt", sub: "sub_2", codigo: "PD-BBBBBB", cartao: NOVO });
  assertEquals(r, { teste: false, motivo: "repeat: card", cobrado: true });
  assertEquals(b.fim, ["sub_2"]);
  assertEquals(b.guardado.teste_repetido, true);
});

Deno.test("cartão pré-pago adicionado → acaba o teste e cobra", async () => {
  const b = base();
  await avaliarTesteClick(b.deps, compra("sub_1", SEM));
  const r = await avaliarCartaoAdicionado(b.deps, { email: "a@x.pt", sub: "sub_1", codigo: "PD-AAAAAA", cartao: { fingerprint: "fpP", funding: "prepaid", last4: "5100" } });
  assertEquals(r, { teste: false, motivo: "prepaid card", cobrado: true });
  assertEquals(b.fim, ["sub_1"]);
});

Deno.test("cartão adicionado sem teste a cobrar e a cobrança falha → cancela e alerta", async () => {
  const b = base(); b.falhar();
  await avaliarTesteClick(b.deps, compra("sub_1", SEM));
  const r = await avaliarCartaoAdicionado(b.deps, { email: "a@x.pt", sub: "sub_1", codigo: "PD-AAAAAA", cartao: { fingerprint: "fpP", funding: "prepaid", last4: "5100" } });
  assertEquals(r.cobrado, false);
  assertEquals(b.cancelados, ["sub_1"]);
  assertEquals(b.alertas.length, 1);
});

// ── Fim do teste sem cartão: o Stripe cancela a subscrição (missing_payment_method = cancel)
const T = 1_800_000_000;
Deno.test("fim do teste sem cartão: só quando estava em teste e acabou no fim do teste, sem pedido de cancelamento", () => {
  const ok = { anterior: "teste", trialEnd: T, endedAt: T + 5, cancelAtPeriodEnd: false, cancelAt: null };
  assertEquals(fimDoTesteSemCartao(ok), true);
  assertEquals(fimDoTesteSemCartao({ ...ok, endedAt: T - 30 }), true);          // poucos segundos antes (relógio)
  assertEquals(fimDoTesteSemCartao({ ...ok, anterior: "incompleto" }), true);   // "active" passageiro já gravado
  assertEquals(fimDoTesteSemCartao({ ...ok, anterior: "cancelado" }), false);
  assertEquals(fimDoTesteSemCartao({ ...ok, anterior: null }), false);
  assertEquals(fimDoTesteSemCartao({ ...ok, endedAt: T + 3 * 3600 }), false);    // muito depois do fim do teste
  assertEquals(fimDoTesteSemCartao({ ...ok, endedAt: T - 3 * 86400 }), false);  // cancelado a meio (Reject & refund, repetição)
  assertEquals(fimDoTesteSemCartao({ ...ok, cancelAtPeriodEnd: true }), false); // o cliente cancelou no teste
  assertEquals(fimDoTesteSemCartao({ ...ok, cancelAt: T }), false);
  assertEquals(fimDoTesteSemCartao({ ...ok, trialEnd: null }), false);
  assertEquals(fimDoTesteSemCartao({ ...ok, endedAt: null }), false);
});

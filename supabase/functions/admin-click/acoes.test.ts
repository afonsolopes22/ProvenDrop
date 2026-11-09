// Testes da lógica pura de admin-click. Correr com:
//   deno test supabase/functions/admin-click/acoes.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  ASSUNTO_RECUSA, autorizar, decidirReembolso, normalizarEmail, paraPendente, TEXTO_RECUSA, ultimaFaturaPaga, validarCorpo,
} from "./acoes.ts";

// ── reembolso ─────────────────────────────────────────────────────────
Deno.test("reembolso: fatura de 1500 com payment_intent → reembolsar", () => {
  assertEquals(decidirReembolso({ amount_paid: 1500, payment_intent: "pi_x" }), { reembolsar: true, payment_intent: "pi_x" });
});
Deno.test("reembolso: fatura de 0 (cupão TESTE100) → não chama a Refunds API", () => {
  assertEquals(decidirReembolso({ amount_paid: 0, payment_intent: "pi_x" }).reembolsar, false);
  assertEquals(decidirReembolso({ amount_paid: 0, payment_intent: null }), { reembolsar: false, payment_intent: null });
});
Deno.test("reembolso: sem payment_intent não há o que devolver, mesmo com valor", () => {
  assertEquals(decidirReembolso({ amount_paid: 1500, payment_intent: null }), { reembolsar: false, payment_intent: null });
  assertEquals(decidirReembolso({ amount_paid: 1500, payment_intent: "" }).reembolsar, false);
});
Deno.test("reembolso: valor inválido (NaN, negativo) → não reembolsar", () => {
  assertEquals(decidirReembolso({ amount_paid: NaN, payment_intent: "pi_x" }).reembolsar, false);
  assertEquals(decidirReembolso({ amount_paid: -5, payment_intent: "pi_x" }).reembolsar, false);
});

// ── última fatura paga ────────────────────────────────────────────────
Deno.test("faturas: a primeira com status paid; payment_intent string ou expandido", () => {
  const lista = [
    { status: "open", amount_paid: 0, payment_intent: "pi_aberta" },
    { status: "paid", amount_paid: 1500, payment_intent: { id: "pi_paga" } },
    { status: "paid", amount_paid: 1500, payment_intent: "pi_antiga" },
  ];
  assertEquals(ultimaFaturaPaga(lista), { amount_paid: 1500, payment_intent: "pi_paga" });
  assertEquals(ultimaFaturaPaga([{ status: "paid", amount_paid: 0, payment_intent: null }]), { amount_paid: 0, payment_intent: null });
});
Deno.test("faturas: nenhuma paga ou lista vazia → null", () => {
  assertEquals(ultimaFaturaPaga([{ status: "open", amount_paid: 0, payment_intent: "pi_1" }]), null);
  assertEquals(ultimaFaturaPaga([]), null);
});

// ── corpo do pedido ───────────────────────────────────────────────────
Deno.test("corpo: listar sem e-mail; validar/recusar com e-mail normalizado", () => {
  assertEquals(validarCorpo({ acao: "listar" }), { ok: true, corpo: { acao: "listar" } });
  assertEquals(validarCorpo({ acao: "validar", email: "  Ana@Example.COM " }), { ok: true, corpo: { acao: "validar", email: "ana@example.com" } });
  assertEquals(validarCorpo({ acao: "recusar", email: "b@c.pt" }), { ok: true, corpo: { acao: "recusar", email: "b@c.pt" } });
});
Deno.test("corpo inválido → 400 corpo_invalido (ação desconhecida, sem e-mail, e-mail mal formado, não-objeto)", () => {
  const esperado = { ok: false, status: 400, erro: "corpo_invalido" } as const;
  assertEquals(validarCorpo({ acao: "apagar", email: "a@b.pt" }), esperado);
  assertEquals(validarCorpo({ acao: "validar" }), esperado);
  assertEquals(validarCorpo({ acao: "recusar", email: "não é e-mail" }), esperado);
  assertEquals(validarCorpo({ acao: "validar", email: 42 }), esperado);
  assertEquals(validarCorpo(null), esperado);
  assertEquals(validarCorpo("listar"), esperado);
  assertEquals(validarCorpo([]), esperado);
  assertEquals(validarCorpo({}), esperado);
});

// ── autorização ───────────────────────────────────────────────────────
Deno.test("autorização: e-mail do JWT igual a ADMIN_EMAIL (minúsculas, sem espaços) → ok", () => {
  assertEquals(autorizar("Afonso@Example.com", "afonso@example.com"), { ok: true });
  assertEquals(autorizar("afonso@example.com", " AFONSO@example.com\n"), { ok: true });
});
Deno.test("autorização: JWT com outro e-mail → 403 nao_autorizado", () => {
  assertEquals(autorizar("outra@example.com", "afonso@example.com"), { ok: false, status: 403, erro: "nao_autorizado" });
});
Deno.test("autorização: sem e-mail no JWT ou sem ADMIN_EMAIL configurado → 403 (ninguém entra)", () => {
  const esperado = { ok: false, status: 403, erro: "nao_autorizado" } as const;
  assertEquals(autorizar(null, "afonso@example.com"), esperado);
  assertEquals(autorizar(undefined, "afonso@example.com"), esperado);
  assertEquals(autorizar("afonso@example.com", ""), esperado);
  assertEquals(autorizar("afonso@example.com", undefined), esperado);
  assertEquals(autorizar("", ""), esperado);
});

// ── textos e projeção ─────────────────────────────────────────────────
Deno.test("texto ao cliente recusado: assunto e corpo exatos do plano, sem português", () => {
  assertEquals(ASSUNTO_RECUSA, "About your ProvenDrop × Click plan");
  assertEquals(TEXTO_RECUSA, "Click couldn't confirm you as a client, so we've refunded your payment in full. You can still join the ProvenDrop Platform plan at provendrop.com.");
  assertEquals(/[ãõçáéíóú]/i.test(ASSUNTO_RECUSA + TEXTO_RECUSA), false);
});
Deno.test("listar: só os seis campos públicos, vazios → null", () => {
  const linha = { email: "a@b.pt", nome: "Ana", telefone: "", loja: null, codigo_compra: "PD-ABC123", criado_em: "2026-11-08T10:00:00Z", user_id: "segredo", estado_click: "pendente" };
  assertEquals(paraPendente(linha), { email: "a@b.pt", nome: "Ana", telefone: null, loja: null, codigo_compra: "PD-ABC123", criado_em: "2026-11-08T10:00:00Z" });
});
Deno.test("normalizarEmail: trim e minúsculas; null → vazio", () => {
  assertEquals(normalizarEmail(" X@Y.Z "), "x@y.z");
  assertEquals(normalizarEmail(null), "");
});

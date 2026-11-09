// deno test supabase/functions/loja-click/index.test.ts
// Testa as regras puras de decidir.ts (o Stripe é simulado pelas fixtures: o que a API devolve
// em checkout.sessions.retrieve). A index.ts só liga estas regras ao Stripe e ao CORS.
import { assertEquals } from "jsr:@std/assert@1";
import { decidirResposta, precisaDeLinhas, sessaoIdValido } from "./decidir.ts";

const PD = "price_direto_1", PC = "price_click_1";
const AGORA = Date.parse("2026-11-08T12:00:00Z");
const ha = (horas: number) => Math.floor((AGORA - horas * 3600e3) / 1000);

const lojaCampo = (value: string | null) =>
  ({ key: "yourstorecompanynameasregisteredwithclick", label: { type: "custom", custom: "Your store / company name (as registered with Click)" }, optional: false, type: "text", text: { value } });

// Sessão como chega na API (customer_details com dados pessoais que NUNCA podem sair na resposta).
const sessaoClick = (extra: Record<string, unknown> = {}) => ({
  id: "cs_live_a1B2c3D4e5F6g7H8i9J0", object: "checkout.session", status: "complete", payment_status: "paid",
  created: ha(1), customer: "cus_123", customer_details: { email: "cliente@example.com", name: "Maria", phone: "+351910000000" },
  metadata: { origem: "click" }, custom_fields: [lojaCampo("  Bella  Shop ")], ...extra,
});

Deno.test("sessão Click completa há 1 h → 200 {\"loja\":\"Bella Shop\"} e nada mais", () => {
  const r = decidirResposta(sessaoClick(), AGORA, PD, PC);
  assertEquals(r, { status: 200, corpo: { loja: "Bella Shop" } });
  assertEquals(Object.keys(r.corpo), ["loja"]);
  assertEquals(JSON.stringify(r.corpo).includes("example.com"), false);
});

Deno.test("sessão Click sem campo de loja → 200 {\"loja\":null}", () => {
  assertEquals(decidirResposta(sessaoClick({ custom_fields: [] }), AGORA, PD, PC), { status: 200, corpo: { loja: null } });
  assertEquals(decidirResposta(sessaoClick({ custom_fields: [lojaCampo(null)] }), AGORA, PD, PC), { status: 200, corpo: { loja: null } });
});

Deno.test("sessão Direct → 404 {}", () => {
  assertEquals(decidirResposta(sessaoClick({ metadata: { origem: "direto" } }), AGORA, PD, PC), { status: 404, corpo: {} });
});

Deno.test("sessão de há 25 h → 404 {}; de há 23 h → 200", () => {
  assertEquals(decidirResposta(sessaoClick({ created: ha(25) }), AGORA, PD, PC), { status: 404, corpo: {} });
  assertEquals(decidirResposta(sessaoClick({ created: ha(23) }), AGORA, PD, PC).status, 200);
  assertEquals(decidirResposta(sessaoClick({ created: undefined }), AGORA, PD, PC), { status: 404, corpo: {} });
});

Deno.test("sessão não concluída (open/expired) ou inexistente → 404 {}", () => {
  assertEquals(decidirResposta(sessaoClick({ status: "open" }), AGORA, PD, PC), { status: 404, corpo: {} });
  assertEquals(decidirResposta(sessaoClick({ status: "expired" }), AGORA, PD, PC), { status: 404, corpo: {} });
  assertEquals(decidirResposta(null, AGORA, PD, PC), { status: 404, corpo: {} });
});

Deno.test("session_id que não começa por cs_ → inválido (400 sem chamar o Stripe)", () => {
  assertEquals(sessaoIdValido("cs_live_a1B2c3D4e5F6g7H8i9J0"), true);
  assertEquals(sessaoIdValido("cs_test_a1B2c3D4"), true);
  assertEquals(sessaoIdValido("sub_1234567890"), false);
  assertEquals(sessaoIdValido("<script>x</script>"), false);
  assertEquals(sessaoIdValido("cs_x"), false);
  assertEquals(sessaoIdValido(""), false);
  assertEquals(sessaoIdValido(undefined), false);
});

Deno.test("origem sem metadata: precisa das line items; price Click nas duas formas → 200, price Direct → 404", () => {
  const semMeta = sessaoClick({ metadata: {} });
  assertEquals(precisaDeLinhas(semMeta, PD, PC), true);
  assertEquals(precisaDeLinhas(sessaoClick(), PD, PC), false);
  assertEquals(decidirResposta(semMeta, AGORA, PD, PC, [{ price: { id: PC } }]), { status: 200, corpo: { loja: "Bella Shop" } });
  assertEquals(decidirResposta(semMeta, AGORA, PD, PC, [{ pricing: { price_details: { price: PC } } }]), { status: 200, corpo: { loja: "Bella Shop" } });
  assertEquals(decidirResposta(semMeta, AGORA, PD, PC, [{ price: { id: PD } }]), { status: 404, corpo: {} });
  assertEquals(decidirResposta(semMeta, AGORA, PD, PC, []), { status: 404, corpo: {} });
});

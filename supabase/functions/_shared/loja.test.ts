// deno test supabase/functions/_shared/loja.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { LOJA_MAX, lojaDaSessao, normalizarLoja } from "./loja.ts";

// Campo como chega na sessão de checkout (API 2026-10-28.endive): key gerada pelo Stripe a partir do rótulo.
const texto = (value: string | null, key = "yourstorecompanynameasregisteredwithclick") =>
  ({ key, label: { type: "custom", custom: "Your store / company name (as registered with Click)" }, optional: false, type: "text", text: { value, default_value: null, maximum_length: null, minimum_length: null } });

Deno.test("loja: trim e espaços colapsados", () => {
  assertEquals(lojaDaSessao({ custom_fields: [texto("  Bella  Shop ")] }), "Bella Shop");
  assertEquals(lojaDaSessao({ custom_fields: [texto("Bella\n\tShop")] }), "Bella Shop");
});

Deno.test("loja: sem custom_fields, lista vazia ou valor vazio → null", () => {
  assertEquals(lojaDaSessao({}), null);
  assertEquals(lojaDaSessao({ custom_fields: null }), null);
  assertEquals(lojaDaSessao({ custom_fields: [] }), null);
  assertEquals(lojaDaSessao({ custom_fields: [texto("   ")] }), null);
  assertEquals(lojaDaSessao({ custom_fields: [texto(null)] }), null);
  assertEquals(lojaDaSessao(null), null);
  assertEquals(lojaDaSessao(undefined), null);
});

Deno.test("loja: 200 caracteres → 80", () => {
  const longo = "A".repeat(200);
  const r = lojaDaSessao({ custom_fields: [texto(longo)] });
  assertEquals(r?.length, LOJA_MAX);
  assertEquals(r, "A".repeat(80));
  assertEquals(normalizarLoja("B".repeat(79) + " C"), "B".repeat(79)); // corte não deixa espaço no fim
});

Deno.test("loja: um dropdown antes do campo de texto → devolve o de texto (a key não interessa)", () => {
  const dropdown = { key: "plano", type: "dropdown", dropdown: { value: "mensal", options: [] } };
  assertEquals(lojaDaSessao({ custom_fields: [dropdown, texto("Bella Shop", "qualquer_key_gerada")] }), "Bella Shop");
  assertEquals(lojaDaSessao({ custom_fields: [texto("Primeira"), texto("Segunda")] }), "Primeira");
});

Deno.test("loja: nenhum campo de texto → null; sem type aceita o primeiro com text.value", () => {
  const dropdown = { key: "plano", type: "dropdown", dropdown: { value: "mensal" } };
  const numerico = { key: "n", type: "numeric", numeric: { value: "12" } };
  assertEquals(lojaDaSessao({ custom_fields: [dropdown, numerico] }), null);
  assertEquals(lojaDaSessao({ custom_fields: [{ key: "x" }, { key: "y", text: { value: " Loja  Y " } }] }), "Loja Y");
});

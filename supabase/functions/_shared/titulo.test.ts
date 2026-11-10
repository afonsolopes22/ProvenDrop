// deno test supabase/functions/_shared/titulo.test.ts
// The function lives in /titulo.js (one file for the member area and for the daily e-mail).
import { assertEquals } from "jsr:@std/assert@1";
import "../../../titulo.js";

const limpar = (globalThis as unknown as { pdLimparTitulo: (c?: string | null, loja?: string | null, link?: string | null) => string }).pdLimparTitulo;

Deno.test("titulo: parte com o nome da loja sai (o caso real)", () => {
  assertEquals(limpar("Men's Fashion | HERLINE London", "herline.uk"), "Men's Fashion");
  assertEquals(limpar("HERLINE London | Men's Fashion", "herline.uk"), "Men's Fashion");
  assertEquals(limpar("Men's Fashion|HERLINE London", "herline.uk"), "Men's Fashion");
});

Deno.test("titulo: outros separadores e domínios com hífen ou dois níveis", () => {
  assertEquals(limpar("Lyra London - Laundry Baskets", "lyra-london.co.uk"), "Laundry Baskets");
  assertEquals(limpar("Laundry Baskets – Lyra London", "www.lyra-london.co.uk"), "Laundry Baskets");
  assertEquals(limpar("Kuschelpullover · Modehaus Behrens", "modehaus-behrens.de"), "Kuschelpullover");
  assertEquals(limpar("Gebreide truien — Klerenhuis", "https://shop.klerenhuis.nl/collections/x"), "Gebreide truien");
});

Deno.test("titulo: a loja vem do link quando não há loja", () => {
  assertEquals(limpar("Men's Fashion | HERLINE London", null, "https://herline.uk/collections/mens-fashion"), "Men's Fashion");
  assertEquals(limpar("Men's Fashion | HERLINE London", "", "herline.uk/collections/mens-fashion"), "Men's Fashion");
});

Deno.test("titulo: sem separador, saem as palavras que escrevem a loja", () => {
  assertEquals(limpar("Herline Winter Jackets", "herline.uk"), "Winter Jackets");
  assertEquals(limpar("Winter Jackets by Lyra London", "lyra-london.co.uk"), "Winter Jackets by");
  assertEquals(limpar("Winter Jackets (herline.uk)", "herline.uk"), "Winter Jackets");
  assertEquals(limpar("Herline: Winter Jackets", "herline.uk"), "Winter Jackets");
});

Deno.test("titulo: títulos sem o nome da loja ficam iguais", () => {
  assertEquals(limpar("Chaquetas y Abrigos Hombre", "marinaroca.com"), "Chaquetas y Abrigos Hombre");
  assertEquals(limpar("T-Shirts - Summer", "herline.uk"), "T-Shirts - Summer");
  assertEquals(limpar("Cappotti Boho da Uomo 2", "example-store.it"), "Cappotti Boho da Uomo 2");
  assertEquals(limpar("  Laundry   Baskets ", "lyra-london.uk"), "Laundry Baskets");
});

Deno.test("titulo: o título inteiro é a loja → vazio (quem chama mostra \"Collection\")", () => {
  assertEquals(limpar("Herline", "herline.uk"), "");
  assertEquals(limpar("Herline | herline.uk", "herline.uk"), "");
});

Deno.test("titulo: só sai o que escreve o domínio (o resto do nome comercial não se adivinha)", () => {
  assertEquals(limpar("HERLINE London", "herline.uk"), "London");
});

Deno.test("titulo: sem domínio utilizável não se mexe no título", () => {
  assertEquals(limpar("Men's Fashion | HERLINE London", null, null), "Men's Fashion | HERLINE London");
  assertEquals(limpar("Men's Fashion | HERLINE London", "sem-ponto"), "Men's Fashion | HERLINE London");
  assertEquals(limpar("AB Jackets", "ab.com"), "AB Jackets");
  assertEquals(limpar(null, "herline.uk"), "");
  assertEquals(limpar("", "herline.uk"), "");
});

Deno.test("titulo: acentos não impedem a correspondência", () => {
  assertEquals(limpar("Abrigos | Mariña Roca", "marina-roca.es"), "Abrigos");
});

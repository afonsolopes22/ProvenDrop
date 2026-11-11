// deno test supabase/functions/email-diario/estado.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { aprovada, cabecalho, dataPorExtenso, porqueFunciona } from "./estado.ts";

Deno.test("estado: as combinações reais do feed dão o mesmo que a área de membros", () => {
  // lista de 2026-11-10: a 1.ª a observar, as outras duas aprovadas (o e-mail mostrava as três com 🟡)
  assertEquals(aprovada("nova", "🟡 OBSERVAR"), false);
  assertEquals(aprovada("continua a bater", "🟢 ANUNCIAR (GB)"), true);
  assertEquals(aprovada("continua a bater", "🟢 ANUNCIAR (IT)"), true);
  // restantes combinações que existem na tabela
  assertEquals(aprovada("nova", "🟢 ANUNCIAR (DE)"), true);
  assertEquals(aprovada("aprovada", "🟢 ANUNCIAR (ES)"), true);
  assertEquals(aprovada("a observar", "🟡 OBSERVAR"), false);
});

Deno.test("estado: cada sinal chega sozinho; sem nenhum, não é aprovada", () => {
  assertEquals(aprovada("aprovada", null), true);
  assertEquals(aprovada("Aprovada", ""), true);
  assertEquals(aprovada(null, "🟢 ANUNCIAR (FR)"), true);
  assertEquals(aprovada(null, null), false);
  assertEquals(aprovada("", ""), false);
  assertEquals(aprovada("nova", null), false);
  assertEquals(aprovada("continua a bater", "🔴 EXCLUIR"), false);
});

Deno.test("data: por extenso em inglês, no fuso de Lisboa", () => {
  assertEquals(dataPorExtenso(new Date("2026-11-11T09:00:00Z")), "Wednesday, 11 November");
  assertEquals(dataPorExtenso(new Date("2026-11-10T09:00:00Z")), "Tuesday, 10 November");
  // 23:30 UTC de 31/12 ainda é dia 31 em Lisboa (UTC+0 no inverno)
  assertEquals(dataPorExtenso(new Date("2026-12-31T23:30:00Z")), "Thursday, 31 December");
  // no verão Lisboa está em UTC+1: 23:30 UTC já é o dia seguinte
  assertEquals(dataPorExtenso(new Date("2026-07-14T23:30:00Z")), "Wednesday, 15 July");
});

Deno.test("cabeçalho: título igual ao nicho aparece uma só vez", () => {
  // lista de 2026-11-10: a coleção "Men's Fashion | HERLINE London" fica "Men's Fashion" e o nicho é "Men's fashion"
  assertEquals(cabecalho("Men's Fashion", "Men's fashion", "GB"), "Men's fashion · GB");
  assertEquals(cabecalho("Men\u2019s  fashion ", "Men's fashion", "GB"), "Men's fashion · GB");
  assertEquals(cabecalho("HOME DECORATION", "Home decoration", "DE"), "Home decoration · DE");
});

Deno.test("cabeçalho: título diferente do nicho mantém as três partes; partes vazias saem", () => {
  assertEquals(cabecalho("Laundry Baskets", "Home decoration", "GB"), "Laundry Baskets · Home decoration · GB");
  assertEquals(cabecalho("Men's Fashion Coats", "Men's fashion", "IT"), "Men's Fashion Coats · Men's fashion · IT");
  assertEquals(cabecalho("Collection", "", "GB"), "Collection · GB");
  assertEquals(cabecalho("Turtlenecks", "Women's fashion", null), "Turtlenecks · Women's fashion");
  assertEquals(cabecalho(null, "Men's fashion", "GB"), "Men's fashion · GB");
});

Deno.test("why it's working: frase limpa; nula, vazia ou só espaços não aparece", () => {
  assertEquals(porqueFunciona("Cosy cable knits, 14 ads for 75 days, demand rising in Spain"), "Cosy cable knits, 14 ads for 75 days, demand rising in Spain");
  assertEquals(porqueFunciona("  14 ads\n for   75 days "), "14 ads for 75 days");
  assertEquals(porqueFunciona(null), "");
  assertEquals(porqueFunciona(undefined), "");
  assertEquals(porqueFunciona(""), "");
  assertEquals(porqueFunciona(" \n\t "), "");
});

// deno test supabase/functions/email-diario/estado.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { aprovada, dataPorExtenso } from "./estado.ts";

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

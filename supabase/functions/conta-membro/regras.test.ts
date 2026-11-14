// deno test supabase/functions/conta-membro/regras.test.ts
// Regras da função conta-membro (2026-11-14): 1 kit por dia (Lisboa) em teste, e "Start my plan now".
import { assertEquals } from "jsr:@std/assert@1";
import { decidirComecar, decidirKit, diaLisboa } from "./regras.ts";

Deno.test("dia de Lisboa (inverno e verão)", () => {
  assertEquals(diaLisboa(new Date("2026-11-14T23:30:00Z")), "2026-11-14");
  assertEquals(diaLisboa(new Date("2026-07-14T23:30:00Z")), "2026-07-15");
});

const HOJE = ["2026-11-14/a.zip", "2026-11-14/b.zip"];
Deno.test("kit em teste: o primeiro do dia é permitido e fica registado", () => {
  assertEquals(decidirKit({ emTeste: true, pedido: "2026-11-14/a.zip", daLista: HOJE, jaHoje: null }), { ok: true, registar: true });
});
Deno.test("kit em teste: o mesmo kit outra vez no mesmo dia é permitido (sem novo registo)", () => {
  assertEquals(decidirKit({ emTeste: true, pedido: "2026-11-14/a.zip", daLista: HOJE, jaHoje: "2026-11-14/a.zip" }), { ok: true, registar: false });
});
Deno.test("kit em teste: um segundo kit diferente no mesmo dia é recusado", () => {
  assertEquals(decidirKit({ emTeste: true, pedido: "2026-11-14/b.zip", daLista: HOJE, jaHoje: "2026-11-14/a.zip" }), { ok: false, erro: "limite_diario" });
});
Deno.test("kit em teste: só kits da lista mais recente", () => {
  assertEquals(decidirKit({ emTeste: true, pedido: "2026-11-10/x.zip", daLista: HOJE, jaHoje: null }), { ok: false, erro: "fora_da_lista" });
});
Deno.test("kit fora do teste: nunca é limitado aqui (os membros pagos usam o bucket diretamente)", () => {
  assertEquals(decidirKit({ emTeste: false, pedido: "2026-11-10/x.zip", daLista: HOJE, jaHoje: "2026-11-14/a.zip" }), { ok: false, erro: "nao_em_teste" });
});

Deno.test("Start my plan now: só em teste, com subscrição em trialing", () => {
  assertEquals(decidirComecar({ emTeste: true, statusStripe: "trialing" }), { ok: true });
  assertEquals(decidirComecar({ emTeste: true, statusStripe: "active" }), { ok: false, erro: "ja_comecou" });
  assertEquals(decidirComecar({ emTeste: false, statusStripe: "active" }), { ok: false, erro: "nao_em_teste" });
  assertEquals(decidirComecar({ emTeste: true, statusStripe: "canceled" }), { ok: false, erro: "ja_comecou" });
});

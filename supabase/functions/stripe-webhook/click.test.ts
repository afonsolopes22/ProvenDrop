import { assertEquals } from "jsr:@std/assert";
import { bloqueadoPorReembolso, reabreRecusado } from "./click.ts";
import { motivoBloqueio } from "./compat.ts";

Deno.test("recusado que faz um checkout novo volta a pendente", () => {
  assertEquals(reabreRecusado("recusado", "PD-AAAAAA", "PD-BBBBBB"), true);
});

Deno.test("o mesmo checkout (mesmo código) nunca reabre a recusa", () => {
  assertEquals(reabreRecusado("recusado", "PD-AAAAAA", "PD-AAAAAA"), false);
});

Deno.test("validado, pendente e sem estado não são reabertos por esta regra", () => {
  assertEquals(reabreRecusado("validado", "PD-AAAAAA", "PD-BBBBBB"), false);
  assertEquals(reabreRecusado("pendente", "PD-AAAAAA", "PD-BBBBBB"), false);
  assertEquals(reabreRecusado(null, null, "PD-BBBBBB"), false);
});

Deno.test("recusado sem código guardado e checkout novo: reabre", () => {
  assertEquals(reabreRecusado("recusado", null, "PD-BBBBBB"), true);
});

Deno.test("bloqueio por reembolso distingue-se do de disputa", () => {
  assertEquals(bloqueadoPorReembolso(motivoBloqueio("reembolso", "ch_123")), true);
  assertEquals(bloqueadoPorReembolso(motivoBloqueio("disputa", "dp_123")), false);
  assertEquals(bloqueadoPorReembolso(null), false);
  assertEquals(bloqueadoPorReembolso(""), false);
});

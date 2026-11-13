// deno test supabase/functions/admin-click/recusa.test.ts
// Reject & refund (2026-11-13): também para quem foi validado automaticamente. Stripe e base em memória;
// a base respeita a condição WHERE da marcação (pendente, ou validado com validado_auto_em).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { type DepsRecusa, podeRecusar, recusarCompra } from "./recusa.ts";
import { temAcesso } from "../_shared/acesso.ts";
import type { FaturaLista } from "./acoes.ts";

function cenario(linha: { estado_click: string | null; validado_auto_em: string | null }, faturas: FaturaLista[]) {
  const row = { email: "cliente@loja.pt", origem: "click", estado: "ativo", bloqueado_em: null, em_atraso_desde: null, codigo_compra: "PD-ABCDEF", ...linha };
  const chamadas: string[] = [];
  const deps: DepsRecusa = {
    marcarRecusado: async () => {
      if (!podeRecusar(row.estado_click, row.validado_auto_em)) return null;
      row.estado_click = "recusado";
      return { codigo_compra: row.codigo_compra };
    },
    subscricoesClick: async () => ["sub_1"],
    faturas: async () => faturas,
    reembolsar: async (pi) => { chamadas.push(`refund ${pi}`); },
    cancelar: async (sub) => { chamadas.push(`cancel ${sub}`); row.estado = "cancelado"; },
    enviarEmailCliente: async () => { chamadas.push("email"); },
    alertar: async () => { chamadas.push("alerta"); return true; },
  };
  return { row, deps, chamadas };
}
const PAGA = [{ status: "paid", amount_paid: 1500, payment_intent: "pi_1" }];

Deno.test("podeRecusar: pendente, ou validado automaticamente; nunca a validação manual nem uma recusa", () => {
  assertEquals(podeRecusar("pendente", null), true);
  assertEquals(podeRecusar("validado", "2026-11-13T10:00:00Z"), true);
  assertEquals(podeRecusar("validado", null), false);
  assertEquals(podeRecusar("recusado", "2026-11-13T10:00:00Z"), false);
  assertEquals(podeRecusar(null, null), false);
});

Deno.test("Reject & refund num validado automaticamente → reembolso total, cancelamento, sem acesso", async () => {
  const { row, deps, chamadas } = cenario({ estado_click: "validado", validado_auto_em: "2026-11-13T10:00:00Z" }, PAGA);
  const r = await recusarCompra(deps, row.email);
  assertEquals(r, { ok: true, reembolsado: true, cancelada: true, email_enviado: true });
  assertEquals(chamadas, ["refund pi_1", "cancel sub_1", "email"]);
  assertEquals(row.estado_click, "recusado");
  assert(!temAcesso(row as never), "depois de recusado não tem acesso");
});

Deno.test("compra a €0 (cupão) → só cancela, sem chamar a Refunds API", async () => {
  const { deps, chamadas } = cenario({ estado_click: "validado", validado_auto_em: "2026-11-13T10:00:00Z" }, [{ status: "paid", amount_paid: 0, payment_intent: null }]);
  const r = await recusarCompra(deps, "cliente@loja.pt");
  assertEquals(r, { ok: true, reembolsado: false, cancelada: true, email_enviado: true });
  assertEquals(chamadas, ["cancel sub_1", "email"]);
});

Deno.test("validado à mão (sem validado_auto_em) → recusa, nada é chamado", async () => {
  const { row, deps, chamadas } = cenario({ estado_click: "validado", validado_auto_em: null }, PAGA);
  assertEquals(await recusarCompra(deps, row.email), { ok: false, erro: "nao_pendente" });
  assertEquals(chamadas, []);
  assertEquals(row.estado_click, "validado");
});

Deno.test("segundo Reject & refund → recusa, sem segundo reembolso", async () => {
  const { row, deps, chamadas } = cenario({ estado_click: "validado", validado_auto_em: "2026-11-13T10:00:00Z" }, PAGA);
  await recusarCompra(deps, row.email);
  assertEquals(await recusarCompra(deps, row.email), { ok: false, erro: "nao_pendente" });
  assertEquals(chamadas.filter((c) => c.startsWith("refund")).length, 1);
});

Deno.test("Stripe falha a meio → alerta ao Afonso e erro stripe_falhou; a linha fica recusada", async () => {
  const { row, deps, chamadas } = cenario({ estado_click: "pendente", validado_auto_em: null }, PAGA);
  deps.cancelar = async () => { throw new Error("stripe down"); };
  const r = await recusarCompra(deps, row.email);
  assertEquals(r, { ok: false, erro: "stripe_falhou", reembolsado: true, cancelada: false });
  assert(chamadas.includes("alerta"));
  assertEquals(row.estado_click, "recusado");
});

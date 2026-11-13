// deno test supabase/functions/stripe-webhook/compra_click.test.ts
// Compra Click com acesso imediato (2026-11-13): a lógica de registarCompraClick, com uma base em memória que
// respeita as condições WHERE das escritas (is null / = 'recusado'). Prova as regras; a condição real no
// PostgREST só fica provada pela compra em modo de teste do Stripe.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { autoValidarClick, type DepsCompraClick, type LinhaClick, registarCompraClick } from "./compra_click.ts";
import { temAcesso } from "../_shared/acesso.ts";

const AGORA = "2026-11-13T10:00:00.000Z";

/** Base em memória com uma linha de subscritores e registo de tudo o que é enviado. */
function base(linha: Partial<LinhaClick> & { email: string }, autoValidar = true) {
  const row: LinhaClick = { estado_click: null, codigo_compra: null, user_id: null, boas_vindas_em: null, validado_auto_em: null, origem: "click", estado: "ativo", bloqueado_em: null, em_atraso_desde: null, ...linha };
  const enviados: Array<{ tipo: string }> = [];
  const alertas: Array<{ assunto: string; linhas: string[]; botao?: { texto: string; url: string } }> = [];
  const deps: DepsCompraClick = {
    autoValidar,
    agora: () => AGORA,
    ler: async () => ({ ...row }),
    gravarDados: async (_e, d) => { Object.assign(row, d); },
    // update … where email = … and estado_click is null
    marcarSeSemEstado: async (_e, campos) => { if (row.estado_click !== null) return false; Object.assign(row, campos); return true; },
    // update … set estado_click = 'pendente' where email = … and estado_click = 'recusado'
    reabrirRecusado: async () => { if (row.estado_click !== "recusado") return false; row.estado_click = "pendente"; return true; },
    garantirLogin: async () => { if (!row.user_id) row.user_id = "u-1"; },
    enviarAcesso: async (_e, tipo) => { enviados.push({ tipo }); if (tipo === "boas_vindas") row.boas_vindas_em = AGORA; return true; },
    alertar: async (assunto, linhas, botao) => { alertas.push({ assunto, linhas, botao }); return true; },
    linkAdmin: (codigo) => `https://provendrop.com/admin.html?compra=${codigo}`,
  };
  return { row, deps, enviados, alertas };
}
const COMPRA = { email: "cliente@loja.pt", codigo: "PD-ABCDEF", telefone: "+351910000000", nome: "Ana", loja: "Loja da Ana", sessao: "cs_test_1" };

Deno.test("flag: por omissão liga; só 'false', '0', 'no' ou 'off' desligam", () => {
  assertEquals(autoValidarClick(undefined), true);
  assertEquals(autoValidarClick(""), true);
  assertEquals(autoValidarClick("true"), true);
  assertEquals(autoValidarClick("1"), true);
  assertEquals(autoValidarClick("false"), false);
  assertEquals(autoValidarClick(" FALSE "), false);
  assertEquals(autoValidarClick("0"), false);
  assertEquals(autoValidarClick("no"), false);
  assertEquals(autoValidarClick("off"), false);
});

Deno.test("compra Click nova → validado logo, validado_auto_em, boas-vindas e alerta com Reject & refund", async () => {
  const { row, deps, enviados, alertas } = base({ email: COMPRA.email });
  const r = await registarCompraClick(deps, COMPRA);
  assertEquals(row.estado_click, "validado");
  assertEquals(row.validado_auto_em, AGORA);
  assertEquals(row.codigo_compra, "PD-ABCDEF");
  assert(temAcesso(row), "um Click validado automaticamente tem acesso");
  assertEquals(enviados, [{ tipo: "boas_vindas" }]);
  assertEquals(alertas.length, 1);
  assertMatch(alertas[0].assunto, /^Click purchase — access granted automatically/);
  const texto = alertas[0].linhas.join("\n");
  for (const v of ["PD-ABCDEF", "Loja da Ana", "cliente@loja.pt", "+351910000000"]) assert(texto.includes(v), `alerta sem ${v}`);
  assertEquals(alertas[0].botao, { texto: "Reject & refund", url: "https://provendrop.com/admin.html?compra=PD-ABCDEF" });
  assertEquals(r.estado, "validado");
  assertEquals(r.auto, true);
});

Deno.test("CLICK_AUTO_VALIDAR=false → pendente como hoje, sem boas-vindas", async () => {
  const { row, deps, enviados, alertas } = base({ email: COMPRA.email }, false);
  await registarCompraClick(deps, COMPRA);
  assertEquals(row.estado_click, "pendente");
  assertEquals(row.validado_auto_em, null);
  assert(!temAcesso(row));
  assertEquals(enviados, []);
  assertMatch(alertas[0].assunto, /^New Click subscription/);
});

Deno.test("recusado + o mesmo evento outra vez (mesmo código) → continua recusado, sem acesso nem e-mail", async () => {
  const { row, deps, enviados } = base({ email: COMPRA.email, estado_click: "recusado", codigo_compra: "PD-ABCDEF", boas_vindas_em: null });
  await registarCompraClick(deps, COMPRA);
  assertEquals(row.estado_click, "recusado");
  assertEquals(row.validado_auto_em, null);
  assert(!temAcesso(row));
  assertEquals(enviados, []);
});

Deno.test("recusado que faz um checkout NOVO → pendente (revisão manual), nunca validado automaticamente", async () => {
  const { row, deps, enviados, alertas } = base({ email: COMPRA.email, estado_click: "recusado", codigo_compra: "PD-OLDOLD" });
  const r = await registarCompraClick(deps, COMPRA);
  assertEquals(row.estado_click, "pendente");
  assertEquals(row.validado_auto_em, null);
  assertEquals(enviados, []);
  assertMatch(alertas[0].assunto, /previously rejected/);
  assertEquals(r.reaberto, true);
});

Deno.test("já validado (evento repetido) → não muda nada nem envia segundas boas-vindas", async () => {
  const { row, deps, enviados } = base({ email: COMPRA.email, estado_click: "validado", validado_auto_em: "2026-11-12T09:00:00.000Z", codigo_compra: "PD-ABCDEF", boas_vindas_em: "2026-11-12T09:00:01.000Z" });
  await registarCompraClick(deps, COMPRA);
  assertEquals(row.estado_click, "validado");
  assertEquals(row.validado_auto_em, "2026-11-12T09:00:00.000Z");
  assertEquals(enviados, []);
});

Deno.test("antigo membro (boas-vindas já enviadas no passado) → recebe o e-mail de regresso", async () => {
  const { row, deps, enviados } = base({ email: COMPRA.email, boas_vindas_em: "2026-09-01T09:00:00.000Z" });
  await registarCompraClick(deps, COMPRA);
  assertEquals(row.estado_click, "validado");
  assertEquals(enviados, [{ tipo: "regresso" }]);
});

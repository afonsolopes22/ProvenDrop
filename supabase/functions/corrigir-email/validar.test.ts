// deno test supabase/functions/corrigir-email/validar.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { JANELA_HORAS, mascarar, podeCorrigir, respostaDeMotivo, sessaoValida, validarNovoEmail, validarSessao } from "./validar.ts";

const PD = "price_direto_1", PC = "price_click_1";
const AGORA = Date.parse("2026-11-06T12:00:00Z");
const ha = (horas: number) => Math.floor((AGORA - horas * 3600e3) / 1000);

// Sessão como chega na API 2026-10-28.endive (customer_details, metadata do Payment Link)
const sessaoDireto = (extra: Record<string, unknown> = {}) => ({
  id: "cs_live_a1B2c3D4e5F6g7H8i9J0", object: "checkout.session", payment_status: "paid", status: "complete",
  created: ha(1), customer: "cus_123", customer_details: { email: "Afonso.Errado@gmail.com" }, metadata: { origem: "direto" }, ...extra,
});

Deno.test("sessão paga, Direct, recente → ok com e-mail em minúsculas e customer", () => {
  const r = validarSessao(sessaoDireto(), [], PD, PC, AGORA);
  assertEquals(r, { ok: true, email: "afonso.errado@gmail.com", customer: "cus_123", criadoEm: ha(1) });
});

Deno.test("sessão inválida: não paga, inexistente ou sem e-mail → recusada (404 sem dizer porquê)", () => {
  assertEquals(validarSessao(sessaoDireto({ payment_status: "unpaid" }), [], PD, PC, AGORA), { ok: false, motivo: "nao_paga" });
  assertEquals(validarSessao(null, [], PD, PC, AGORA), { ok: false, motivo: "nao_paga" });
  assertEquals(validarSessao(sessaoDireto({ customer_details: {}, customer: { id: "cus_123", email: null } }), [], PD, PC, AGORA), { ok: false, motivo: "sem_email" });
  assertEquals(respostaDeMotivo("nao_paga"), { status: 404, erro: "sessao_nao_encontrada" });
  assertEquals(respostaDeMotivo("sem_email"), { status: 404, erro: "sessao_nao_encontrada" });
  assertEquals(sessaoValida("cs_live_a1B2c3D4e5F6g7H8i9J0"), true);
  assertEquals(sessaoValida("<script>"), false);
  assertEquals(sessaoValida("cs_live_x"), false);
});

Deno.test("sessão com mais de 24 h → expirada (410)", () => {
  assertEquals(validarSessao(sessaoDireto({ created: ha(JANELA_HORAS + 0.01) }), [], PD, PC, AGORA), { ok: false, motivo: "expirada" });
  assertEquals(validarSessao(sessaoDireto({ created: ha(JANELA_HORAS - 0.01) }), [], PD, PC, AGORA).ok, true);
  assertEquals(respostaDeMotivo("expirada"), { status: 410, erro: "expirada" });
});

Deno.test("sessão da porta Click (metadata ou price_id) → recusada; Direct pelo price_id das linhas → ok", () => {
  assertEquals(validarSessao(sessaoDireto({ metadata: { origem: "click" } }), [], PD, PC, AGORA), { ok: false, motivo: "nao_direto" });
  const linhasClick = { data: [{ pricing: { price_details: { price: PC } } }] };
  assertEquals(validarSessao(sessaoDireto({ metadata: {} }), linhasClick, PD, PC, AGORA), { ok: false, motivo: "nao_direto" });
  const linhasDireto = { data: [{ price: { id: PD } }, { price: { id: "price_adesao" } }] };
  assertEquals(validarSessao(sessaoDireto({ metadata: {} }), linhasDireto, PD, PC, AGORA).ok, true);
});

Deno.test("e-mail do customer expandido (acacia) quando customer_details não traz e-mail", () => {
  const r = validarSessao(sessaoDireto({ customer_details: null, customer: { id: "cus_9", email: "x@y.pt" } }), [], PD, PC, AGORA);
  assertEquals(r, { ok: true, email: "x@y.pt", customer: "cus_9", criadoEm: ha(1) });
});

Deno.test("segunda correção da mesma sessão → recusada (409); outra sessão do mesmo subscritor → permitida", () => {
  const sid = "cs_live_a1B2c3D4e5F6g7H8i9J0";
  assertEquals(podeCorrigir({ email_corrigido_em: null, email_corrigido_sessao: null }, sid), true);
  assertEquals(podeCorrigir({ email_corrigido_em: "2026-11-06T10:00:00Z", email_corrigido_sessao: sid }, sid), false);
  assertEquals(podeCorrigir({ email_corrigido_em: "2026-11-06T10:00:00Z", email_corrigido_sessao: null }, sid), false);
  assertEquals(podeCorrigir({ email_corrigido_em: "2026-10-01T10:00:00Z", email_corrigido_sessao: "cs_live_outraSessaoAntiga" }, sid), true);
  assertEquals(podeCorrigir(null, sid), false);
  assertEquals(respostaDeMotivo("ja_corrigido"), { status: 409, erro: "ja_corrigido" });
});

Deno.test("e-mails diferentes, inválido, igual ao atual → 422; válido → minúsculas", () => {
  assertEquals(validarNovoEmail("a@b.pt", "novo@gmail.com", "nov0@gmail.com"), { ok: false, motivo: "emails_diferentes" });
  assertEquals(validarNovoEmail("a@b.pt", "novo", "novo"), { ok: false, motivo: "email_invalido" });
  assertEquals(validarNovoEmail("a@b.pt", "A@B.PT", "a@b.pt"), { ok: false, motivo: "mesmo_email" });
  assertEquals(validarNovoEmail("a@b.pt", " Novo@Gmail.com ", "novo@gmail.com"), { ok: true, novo: "novo@gmail.com" });
  assertEquals(validarNovoEmail("a@b.pt", "novo@gmail.com"), { ok: true, novo: "novo@gmail.com" }); // sem confirmação
  assertEquals(respostaDeMotivo("emails_diferentes"), { status: 422, erro: "emails_diferentes" });
  assertEquals(respostaDeMotivo("email_em_uso"), { status: 422, erro: "email_em_uso" });
  assertEquals(respostaDeMotivo("ainda_a_registar"), { status: 503, erro: "ainda_a_registar" });
});

Deno.test("mascarar: nunca devolve o e-mail inteiro", () => {
  assertEquals(mascarar("afonso.errado@gmail.com"), "afo•••@gmail.com");
  assertEquals(mascarar("ab@x.pt"), "a•••@x.pt");
  assertEquals(mascarar("abcd@x.pt"), "a•••@x.pt");
  assertEquals(mascarar("abcde@x.pt"), "abc•••@x.pt");
  assertEquals(mascarar("semarroba"), "•••");
});

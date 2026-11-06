// Regras puras da correção de e-mail no checkout (sem Deno, sem Stripe, sem base):
// testadas em validar.test.ts. A função index.ts só liga estas regras ao Stripe,
// à base e ao e-mail.

import { origemDaSessao } from "../stripe-webhook/compat.ts";

export const JANELA_HORAS = 24;
export const LIMITE_GET = 20;   // pedidos GET por IP em 10 min
export const LIMITE_POST = 5;   // pedidos POST por IP em 10 min
export const JANELA_MIN = 10;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" ? (v as Obj) : null);

export type Motivo =
  | "nao_paga" | "expirada" | "nao_direto" | "sem_email"        // sessão
  | "ja_corrigido" | "mesmo_email" | "emails_diferentes" | "email_invalido" | "email_em_uso" | "ainda_a_registar"; // correção

export type SessaoOk = { ok: true; email: string; customer: string | null; criadoEm: number };
export type Recusa = { ok: false; motivo: Motivo };

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_SESSAO = /^cs_(live|test)_[A-Za-z0-9]{10,}$/;

export const emailValido = (e: unknown): boolean => typeof e === "string" && e.length <= 254 && RE_EMAIL.test(e);
export const sessaoValida = (id: unknown): boolean => typeof id === "string" && RE_SESSAO.test(id);

/** "afonso@gmail.com" → "afo•••@gmail.com"; "ab@x.pt" → "a•••@x.pt". Nunca devolve o e-mail inteiro. */
export function mascarar(email: string): string {
  const e = String(email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = e.slice(0, at), dominio = e.slice(at + 1);
  const visivel = local.length >= 5 ? 3 : 1;
  return `${local.slice(0, visivel)}•••@${dominio}`;
}

/** E-mail do comprador numa sessão de checkout: customer_details.email, senão customer.email (expandido). */
export function emailDaSessao(s: unknown): string {
  const o = obj(s);
  const d = String(obj(o?.customer_details)?.email ?? "").trim().toLowerCase();
  if (d) return d;
  const c = obj(o?.customer);
  return c && !c.deleted ? String(c.email ?? "").trim().toLowerCase() : "";
}

/** "cus_…" ou objeto expandido → id. */
export function clienteDaSessao(s: unknown): string | null {
  const c = obj(s)?.customer;
  if (typeof c === "string" && c) return c;
  const id = obj(c)?.id;
  return typeof id === "string" && id ? id : null;
}

/**
 * A sessão serve para corrigir o e-mail se: está paga, foi criada há menos de 24 h,
 * é da porta Direct (metadata ou price_id, compat.ts) e tem e-mail do comprador.
 * `linhas` são as line items (só precisas quando a metadata falta).
 */
export function validarSessao(s: unknown, linhas: unknown, priceDireto: string, priceClick: string, agoraMs = Date.now()): SessaoOk | Recusa {
  const o = obj(s);
  if (!o) return { ok: false, motivo: "nao_paga" };
  const ps = String(o.payment_status ?? "");
  if (ps !== "paid" && ps !== "no_payment_required") return { ok: false, motivo: "nao_paga" };
  const criado = Number(o.created ?? 0);
  if (!criado || agoraMs - criado * 1000 > JANELA_HORAS * 3600e3) return { ok: false, motivo: "expirada" };
  if (origemDaSessao(o, linhas, priceDireto, priceClick) !== "direto") return { ok: false, motivo: "nao_direto" };
  const email = emailDaSessao(o);
  if (!emailValido(email)) return { ok: false, motivo: "sem_email" };
  return { ok: true, email, customer: clienteDaSessao(o), criadoEm: criado };
}

/** O e-mail novo: válido, diferente do atual e igual à confirmação (quando enviada). */
export function validarNovoEmail(atual: string, novo: unknown, confirmacao?: unknown): { ok: true; novo: string } | Recusa {
  const n = String(novo ?? "").trim().toLowerCase();
  if (!emailValido(n)) return { ok: false, motivo: "email_invalido" };
  if (confirmacao !== undefined && confirmacao !== null && String(confirmacao).trim().toLowerCase() !== n) return { ok: false, motivo: "emails_diferentes" };
  if (n === String(atual ?? "").trim().toLowerCase()) return { ok: false, motivo: "mesmo_email" };
  return { ok: true, novo: n };
}

/** Uma correção por sessão: recusa se esta sessão já foi corrigida (segunda correção). */
export function podeCorrigir(sub: { email_corrigido_em?: string | null; email_corrigido_sessao?: string | null } | null | undefined, sessao: string): boolean {
  if (!sub) return false;
  if (!sub.email_corrigido_em) return true;
  return !!sub.email_corrigido_sessao && sub.email_corrigido_sessao !== sessao;
}

/** Código HTTP e texto de erro (sem dados pessoais) para cada motivo. */
export function respostaDeMotivo(motivo: Motivo): { status: number; erro: string } {
  switch (motivo) {
    case "expirada": return { status: 410, erro: "expirada" };
    case "ja_corrigido": return { status: 409, erro: "ja_corrigido" };
    case "ainda_a_registar": return { status: 503, erro: "ainda_a_registar" };
    case "mesmo_email":
    case "emails_diferentes":
    case "email_invalido":
    case "email_em_uso": return { status: 422, erro: motivo };
    default: return { status: 404, erro: "sessao_nao_encontrada" }; // nao_paga, nao_direto, sem_email: nunca se diz qual
  }
}

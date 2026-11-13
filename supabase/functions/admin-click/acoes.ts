// admin-click · lógica pura (sem Deno.env, sem rede): validação do corpo, autorização
// pelo e-mail do JWT, decisão de reembolso e textos ao cliente. Testada em acoes.test.ts.

/** Fatura do Stripe reduzida ao que interessa para o reembolso. */
export interface Fatura { amount_paid: number; payment_intent: string | null }

/**
 * Reembolsa-se só quando houve dinheiro a entrar (amount_paid > 0) e há um
 * payment_intent para devolver. Uma compra com cupão de 100 % (TESTE100) tem
 * fatura de 0: não se chama a Refunds API, só se cancela a subscrição.
 */
export function decidirReembolso(f: Fatura): { reembolsar: boolean; payment_intent: string | null } {
  const pi = typeof f.payment_intent === "string" && f.payment_intent ? f.payment_intent : null;
  const pago = Number.isFinite(f.amount_paid) && f.amount_paid > 0;
  return { reembolsar: pago && pi !== null, payment_intent: pi };
}

/** Linha da lista de faturas do Stripe (acacia: payment_intent string ou expandido). */
export interface FaturaLista { status?: string | null; amount_paid?: number | null; payment_intent?: string | { id: string } | null }

/** Primeira fatura com status 'paid' da lista (o Stripe devolve-as da mais recente para a mais antiga). */
export function ultimaFaturaPaga(faturas: FaturaLista[]): Fatura | null {
  for (const f of faturas ?? []) {
    if (f?.status !== "paid") continue;
    const pi = typeof f.payment_intent === "string" ? f.payment_intent : f.payment_intent?.id ?? null;
    return { amount_paid: Number(f.amount_paid ?? 0), payment_intent: pi || null };
  }
  return null;
}

// ── corpo do pedido ─────────────────────────────────────────────────────

export type Corpo = { acao: "listar" | "listar_auto" } | { acao: "validar" | "recusar"; email: string };
export type Recusa = { ok: false; status: 400 | 403; erro: "corpo_invalido" | "nao_autorizado" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** E-mail normalizado para comparação e para a cláusula where: trim + minúsculas. */
export function normalizarEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/** `{acao:"listar"|"listar_auto"}` ou `{acao:"validar"|"recusar", email}`; qualquer outra coisa → 400 corpo_invalido. */
export function validarCorpo(c: unknown): { ok: true; corpo: Corpo } | Recusa {
  const invalido: Recusa = { ok: false, status: 400, erro: "corpo_invalido" };
  if (!c || typeof c !== "object" || Array.isArray(c)) return invalido;
  const acao = (c as { acao?: unknown }).acao;
  if (acao === "listar" || acao === "listar_auto") return { ok: true, corpo: { acao } };
  if (acao !== "validar" && acao !== "recusar") return invalido;
  const email = normalizarEmail((c as { email?: unknown }).email);
  if (!EMAIL_RE.test(email)) return invalido;
  return { ok: true, corpo: { acao, email } };
}

// ── autorização ─────────────────────────────────────────────────────────

/**
 * Só o administrador: o e-mail do utilizador do JWT tem de ser igual (minúsculas,
 * sem espaços) ao secret ADMIN_EMAIL. Sem ADMIN_EMAIL configurado ninguém entra.
 */
export function autorizar(emailJwt: unknown, adminEmail: unknown): { ok: true } | Recusa {
  const a = normalizarEmail(emailJwt), b = normalizarEmail(adminEmail);
  if (!a || !b || a !== b) return { ok: false, status: 403, erro: "nao_autorizado" };
  return { ok: true };
}

// ── textos ao cliente (inglês; exatos, do plano) ────────────────────────

export const ASSUNTO_RECUSA = "About your ProvenDrop × Click plan";
export const TEXTO_RECUSA =
  "Click couldn't confirm you as a client, so we've refunded your payment in full. You can still join the ProvenDrop Platform plan at provendrop.com.";
export const URL_SITE = "https://provendrop.com/";

/** Linha da lista de pendentes devolvida pela ação `listar`. */
export interface Pendente { email: string; nome: string | null; telefone: string | null; loja: string | null; codigo_compra: string | null; criado_em: string | null }

/** Projeta uma linha de subscritores na forma pública da lista (nunca outros campos). */
export function paraPendente(r: Record<string, unknown>): Pendente {
  const t = (v: unknown) => (v == null || v === "" ? null : String(v));
  return { email: String(r.email ?? ""), nome: t(r.nome), telefone: t(r.telefone), loja: t(r.loja), codigo_compra: t(r.codigo_compra), criado_em: t(r.criado_em) };
}

// Estado da base (subscricoes.estado) a partir de uma subscrição do Stripe, partilhado pelo stripe-webhook e pela
// reconciliar (2026-11-16, teste grátis Click sem cartão).
//
// Visto no Stripe de teste com relógios de teste: no fim de um teste grátis a subscrição passa a "active" ANTES de
// haver pagamento. Sem cartão (missing_payment_method = cancel) fica "active" por instantes e depois é cancelada;
// com cartão fica "active" com a fatura do ciclo em rascunho durante 1 hora, e só então é cobrada. Por isso, depois
// de um teste, "active" (ou "past_due") só conta como ativo/em atraso se já houver uma fatura paga depois do teste;
// até lá é "incompleto" (sem acesso). Subscrições sem teste (plano Platform, Start my plan) não mudam.

export type Estado = "ativo" | "teste" | "em_atraso" | "incompleto" | "cancelado";
export interface FaturaMin { status: string | null; total: number; created: number; billing_reason: string | null }

/** Folga (s) entre o fim do teste e a criação da fatura do ciclo, para relógios ligeiramente desfasados. */
const FOLGA = 600;
const cobra = (s: string) => s === "active" || s === "past_due" || s === "unpaid";
const posTeste = (trialEnd: number, f: FaturaMin) => f.billing_reason !== "subscription_create" && f.created >= trialEnd - FOLGA;

/** Só depois do fim de um teste, e com a subscrição a cobrar, é preciso ler as faturas (uma chamada a mais ao Stripe). */
export function precisaDeFaturas(i: { status: string; trialEnd: number | null; agora: number }): boolean {
  return !!i.trialEnd && i.trialEnd <= i.agora && cobra(i.status);
}

export function estadoDaSubscricao(i: { status: string; trialEnd: number | null; agora: number; faturas: FaturaMin[] }): Estado {
  if (i.status === "trialing") return "teste";
  if (i.status === "incomplete") return "incompleto";
  if (!cobra(i.status)) return "cancelado"; // canceled, incomplete_expired, paused
  if (precisaDeFaturas(i) && !i.faturas.some((f) => posTeste(i.trialEnd!, f) && f.status === "paid")) return "incompleto";
  return i.status === "active" ? "ativo" : "em_atraso";
}

/** A fatura do ciclo depois do teste ainda em rascunho (o Stripe só a cobra 1 hora depois): id, para a cobrar já. */
export function faturaPorCobrar(i: { trialEnd: number | null; faturas: Array<FaturaMin & { id: string }> }): string | null {
  if (!i.trialEnd) return null;
  return i.faturas.find((f) => posTeste(i.trialEnd!, f) && f.status === "draft" && f.total > 0)?.id ?? null;
}

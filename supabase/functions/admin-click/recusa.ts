// admin-click · Reject & refund, sem rede nem Deno.env (index.ts liga as dependências; recusa.test.ts usa uma
// base e um Stripe em memória). Desde 2026-11-13 também recusa quem foi validado automaticamente na compra.
import { decidirReembolso, type FaturaLista, ultimaFaturaPaga } from "./acoes.ts";

/**
 * Pode ser recusada: a compra pendente, ou a validada AUTOMATICAMENTE (validado_auto_em preenchido). Uma
 * validação feita à mão e uma recusa já feita ficam como estão. É a mesma condição do update em index.ts.
 */
export function podeRecusar(estadoClick: string | null | undefined, validadoAutoEm: string | null | undefined): boolean {
  return estadoClick === "pendente" || (estadoClick === "validado" && !!validadoAutoEm);
}

export interface DepsRecusa {
  /** update … set estado_click = 'recusado' where (podeRecusar); devolve a linha, ou null se não podia. */
  marcarRecusado: (email: string) => Promise<{ codigo_compra: string | null } | null>;
  /** Subscrições Click a cobrar (ativo/em_atraso) deste e-mail. */
  subscricoesClick: (email: string) => Promise<string[]>;
  faturas: (subId: string) => Promise<FaturaLista[]>;
  reembolsar: (paymentIntent: string) => Promise<void>;
  cancelar: (subId: string) => Promise<void>;
  enviarEmailCliente: (email: string) => Promise<void>;
  alertar: (assunto: string, linhas: string[]) => Promise<boolean>;
}

export type ResultadoRecusa =
  | { ok: true; reembolsado: boolean; cancelada: boolean; email_enviado: boolean }
  | { ok: false; erro: "nao_pendente" }
  | { ok: false; erro: "stripe_falhou"; reembolsado: boolean; cancelada: boolean };

/**
 * Marca 'recusado' ANTES de tocar no Stripe (o charge.refunded do webhook conta com isso para não bloquear
 * a pessoa como "suspensa"); depois, por cada subscrição Click a cobrar, reembolso total da última fatura
 * paga (só se houve valor: uma compra a 0 só é cancelada) e cancelamento imediato; por fim o e-mail ao cliente.
 */
export async function recusarCompra(deps: DepsRecusa, email: string): Promise<ResultadoRecusa> {
  const linha = await deps.marcarRecusado(email);
  if (!linha) return { ok: false, erro: "nao_pendente" };
  const codigo = linha.codigo_compra ?? "—";

  let reembolsado = false, cancelada = false;
  try {
    for (const subId of await deps.subscricoesClick(email)) {
      const paga = ultimaFaturaPaga(await deps.faturas(subId));
      const d = paga ? decidirReembolso(paga) : { reembolsar: false, payment_intent: null };
      if (d.reembolsar && d.payment_intent) { await deps.reembolsar(d.payment_intent); reembolsado = true; }
      await deps.cancelar(subId);
      cancelada = true;
    }
  } catch {
    await deps.alertar(`Click rejection needs a manual step in Stripe · ${codigo}`, [
      `The purchase ${codigo} was marked as rejected, but Stripe failed half-way.`,
      `Refund done: ${reembolsado ? "yes" : "no"}. Subscription cancelled: ${cancelada ? "yes" : "no"}.`,
      "Finish in the Stripe dashboard (Customers → search by e-mail): refund the last paid invoice in full and cancel the subscription immediately.",
      "The customer has NOT been e-mailed yet; tell them once it is done.",
    ]);
    return { ok: false, erro: "stripe_falhou", reembolsado, cancelada };
  }

  let emailEnviado = false;
  try { await deps.enviarEmailCliente(email); emailEnviado = true; } catch { emailEnviado = false; }
  return { ok: true, reembolsado, cancelada, email_enviado: emailEnviado };
}

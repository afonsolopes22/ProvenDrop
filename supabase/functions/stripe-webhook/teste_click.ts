// Plano Click: teste grátis de 5 dias com anti-abuso (2026-11-14). Sem rede nem Deno.env: a base, o Stripe e o
// e-mail entram por `deps` (index.ts liga-as; teste_click.test.ts usa uma base em memória).
//
// Um teste por pessoa: o cartão (impressão digital), o telefone (só dígitos, com indicativo) e a loja (minúsculas,
// sem espaços, pontuação nem acentos) ficam em testes_click_usados com a subscrição que teve o teste. Se algum já
// lá estava com OUTRA subscrição, ou se o cartão é pré-pago, o teste acaba já (trial_end = now) e o primeiro mês é
// cobrado. Se essa cobrança falhar, a subscrição é cancelada: ninguém fica com acesso grátis por isso.
//
// Promoção de lançamento (2026-11-14): só há teste para subscrições criadas até TRIAL_ATE (por omissão
// 2026-11-20 23:59 em Lisboa, que em novembro é UTC; o segredo CLICK_TRIAL_ATE pode mudá-lo). Rede de segurança:
// se depois disso chegar uma compra nova em "trialing" (o link ainda com o teste ligado), o teste acaba na hora
// e o primeiro mês é cobrado, como num teste repetido. Quem já está em teste continua os 5 dias normais.

export const TRIAL_ATE_PADRAO = "2026-11-20T23:59:00+00:00";

/** Fim da oferta em ms; vazio ou inválido → TRIAL_ATE_PADRAO. */
export function fimDaOferta(v: string | null | undefined): number {
  const t = Date.parse(String(v ?? "").trim());
  return Number.isFinite(t) ? t : Date.parse(TRIAL_ATE_PADRAO);
}

/** A subscrição foi criada depois do fim da oferta? (às 23:59:00 em ponto ainda conta) */
export function ofertaTerminou(criadaEmMs: number, fimMs: number): boolean {
  return criadaEmMs > fimMs;
}

/** Telefone só com dígitos, com indicativo ("00" inicial tirado). Menos de 8 dígitos: não conta. */
export function normalizarTelefone(v: string | null | undefined): string | null {
  const d = String(v ?? "").replace(/\D+/g, "").replace(/^00/, "");
  return d.length >= 8 ? d : null;
}

/** Loja em minúsculas, sem acentos, espaços nem pontuação (só letras e dígitos). Menos de 3 caracteres: não conta. */
export function normalizarLoja(v: string | null | undefined): string | null {
  const s = String(v ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return s.length >= 3 ? s : null;
}

export type TipoDado = "cartao" | "telefone" | "loja";
const NOME_EN: Record<TipoDado, string> = { cartao: "card", telefone: "phone", loja: "store" };

/** Teste ou não, e porquê (o motivo vai para admin.html). */
export function decidirTeste(i: { funding: string | null | undefined; repetidos: TipoDado[] }): { teste: boolean; motivo: string | null } {
  const partes: string[] = [];
  if (i.funding === "prepaid") partes.push("prepaid card");
  if (i.repetidos.length) partes.push("repeat: " + i.repetidos.map((t) => NOME_EN[t]).join(", "));
  return partes.length ? { teste: false, motivo: partes.join("; ") } : { teste: true, motivo: null };
}

export interface DadosCartao { fingerprint: string | null; funding: string | null; last4: string | null }

export interface DepsTesteClick {
  /** insert into testes_click_usados … on conflict (tipo, valor) do nothing; devolve os tipos cujo valor pertence a OUTRA subscrição. */
  reclamar: (valores: Array<{ tipo: TipoDado; valor: string }>, email: string, sub: string) => Promise<TipoDado[]>;
  /** trial_end = now, com a cobrança feita já; lança se a cobrança falhar. */
  acabarTeste: (sub: string) => Promise<void>;
  cancelar: (sub: string) => Promise<void>;
  guardar: (email: string, d: Record<string, unknown>) => Promise<void>;
  alertar: (assunto: string, linhas: string[]) => Promise<boolean>;
}

export interface CompraTeste { email: string; sub: string; codigo: string; emTeste: boolean; telefone: string | null; loja: string | null; cartao: DadosCartao | null; ofertaTerminou?: boolean }

export async function avaliarTesteClick(deps: DepsTesteClick, c: CompraTeste): Promise<{ teste: boolean; motivo: string | null; cobrado: boolean | null }> {
  const telefone = normalizarTelefone(c.telefone), loja = normalizarLoja(c.loja);
  const impressao = c.cartao?.fingerprint && c.cartao.fingerprint.length >= 3 ? c.cartao.fingerprint : null;
  await deps.guardar(c.email, {
    cartao_ultimos4: c.cartao?.last4 ?? null, cartao_impressao: impressao, cartao_tipo: c.cartao?.funding ?? null,
    telefone_norm: telefone, loja_norm: loja,
  });
  // Link sem teste (ou a subscrição já não está em teste): nada a decidir.
  if (!c.emTeste) return { teste: false, motivo: null, cobrado: null };

  const valores: Array<{ tipo: TipoDado; valor: string }> = [];
  if (impressao) valores.push({ tipo: "cartao", valor: impressao });
  if (telefone) valores.push({ tipo: "telefone", valor: telefone });
  if (loja) valores.push({ tipo: "loja", valor: loja });
  // Fora do prazo da oferta não há teste para ninguém, e o teste da pessoa não fica gasto.
  const repetidos = !c.ofertaTerminou && valores.length ? await deps.reclamar(valores, c.email, c.sub) : [];
  const d = c.ofertaTerminou ? { teste: false, motivo: "trial offer ended" } : decidirTeste({ funding: c.cartao?.funding, repetidos });
  await deps.guardar(c.email, { teste_repetido: repetidos.length > 0, teste_motivo: d.motivo });
  if (d.teste) return { teste: true, motivo: null, cobrado: null };

  try {
    await deps.acabarTeste(c.sub);
    return { teste: false, motivo: d.motivo, cobrado: true };
  } catch (e) {
    await deps.cancelar(c.sub);
    await deps.alertar(`Click purchase without free trial: payment failed, subscription cancelled · ${c.codigo}`, [
      `Reason for no trial: ${d.motivo}.`, `E-mail: ${c.email}`,
      `The first month could not be charged (${String((e as Error)?.message ?? e).slice(0, 120)}), so the subscription was cancelled and there is no access.`,
    ]);
    return { teste: false, motivo: d.motivo, cobrado: false };
  }
}

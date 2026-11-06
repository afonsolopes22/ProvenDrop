// Leitura tolerante dos objetos do Stripe nas duas formas em que chegam à
// função: a versão fixada pelo SDK para as chamadas à API (2025-02-24.acacia,
// "antiga") e a versão do endpoint do webhook em modo real (2026-10-28.endive,
// "nova", igual à 2025-03-31.basil nestes campos). Funções puras, sem Deno nem
// Stripe: testadas em compat.test.ts com fixtures das duas versões.
//
//   subscrição numa fatura   invoice.subscription            | invoice.parent.subscription_details.subscription
//   price_id de uma linha    line.price.id                   | line.pricing.price_details.price
//   fim do período           subscription.current_period_end | subscription.items.data[0].current_period_end
//   origem                   metadata.origem (sessão ou subscrição) → fallback pelo price_id

export type Origem = "direto" | "click";
type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | null => (v && typeof v === "object" ? (v as Obj) : null);
/** "sub_…" ou { id: "sub_…" } → "sub_…" */
const idDe = (v: unknown): string | null => {
  if (typeof v === "string" && v) return v;
  const id = obj(v)?.id;
  return typeof id === "string" && id ? id : null;
};
/** lista ou { data: lista } → lista */
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : Array.isArray(obj(v)?.data) ? (obj(v)!.data as unknown[]) : []);

/** Subscrição de uma fatura (ou null numa fatura avulsa). */
export function subscricaoDaInvoice(inv: unknown): string | null {
  const i = obj(inv);
  if (!i) return null;
  const antiga = idDe(i.subscription);
  if (antiga) return antiga;
  const detalhes = obj(obj(i.parent)?.subscription_details);
  return idDe(detalhes?.subscription);
}

/** price_id de uma linha de fatura, de sessão de checkout ou item de subscrição. */
export function precoDaLinha(linha: unknown): string | null {
  const l = obj(linha);
  if (!l) return null;
  const antigo = idDe(l.price);
  if (antigo) return antigo;
  const detalhes = obj(obj(l.pricing)?.price_details);
  return idDe(detalhes?.price);
}

/** price_ids de todas as linhas (sem vazios, sem repetidos). */
export function precosDasLinhas(linhas: unknown): string[] {
  return [...new Set(lista(linhas).map(precoDaLinha).filter((p): p is string => !!p))];
}

/** Fim do período corrente, em segundos unix (null se faltar nas duas formas). */
export function fimDoPeriodo(sub: unknown): number | null {
  const s = obj(sub);
  if (!s) return null;
  if (typeof s.current_period_end === "number") return s.current_period_end;
  const primeiro = obj(lista(s.items)[0]);
  return typeof primeiro?.current_period_end === "number" ? primeiro.current_period_end : null;
}

/** metadata.origem: "direto" | "click" (qualquer capitalização) ou null. */
export function origemDeMetadata(m: unknown): Origem | null {
  const o = String(obj(m)?.origem ?? "").trim().toLowerCase();
  return o === "direto" || o === "click" ? o : null;
}

/** Origem pelos price_ids configurados (STRIPE_PRICE_DIRETO / STRIPE_PRICE_CLICK). */
export function origemDePrecos(precos: string[], priceDireto: string, priceClick: string): Origem | null {
  if (priceDireto && precos.includes(priceDireto)) return "direto";
  if (priceClick && precos.includes(priceClick)) return "click";
  return null;
}

/** Origem de uma subscrição: metadata, senão os price_ids dos items (nas duas formas). */
export function origemDaSubscricao(sub: unknown, priceDireto: string, priceClick: string): Origem | null {
  const s = obj(sub);
  if (!s) return null;
  return origemDeMetadata(s.metadata) ?? origemDePrecos(precosDasLinhas(s.items), priceDireto, priceClick);
}

/** Origem de uma sessão de checkout: metadata da sessão, senão metadata da subscrição expandida, senão price_ids das linhas dadas. */
export function origemDaSessao(sessao: unknown, linhas: unknown, priceDireto: string, priceClick: string): Origem | null {
  const s = obj(sessao);
  if (!s) return null;
  return origemDeMetadata(s.metadata) ??
    origemDeMetadata(obj(s.subscription)?.metadata) ??
    origemDePrecos(precosDasLinhas(linhas), priceDireto, priceClick);
}

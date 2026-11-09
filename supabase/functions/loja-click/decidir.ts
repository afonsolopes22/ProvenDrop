// Regras puras da função loja-click (sem Deno, sem Stripe, sem base): testadas em
// index.test.ts. A index.ts só liga estas regras ao Stripe e ao CORS.
//
// A página bem-vindo-click.html pede a loja indicada no checkout para a pôr na
// mensagem de WhatsApp. Só se devolve a loja (nunca e-mail, nome ou telefone) e só
// para uma sessão Click concluída há menos de 24 h; tudo o resto é 404 {} sem dizer porquê.

import { origemDaSessao } from "../stripe-webhook/compat.ts";
import { lojaDaSessao, type SessaoComCampos } from "../_shared/loja.ts";

export const JANELA_HORAS = 24;
/** O mesmo filtro que a página aplica ao ?session_id= antes de chamar a função. */
export const RE_SESSAO = /^cs_[A-Za-z0-9_]{8,}$/;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" ? (v as Obj) : null);

/** true se o id tem a forma de uma sessão de checkout; falso → 400 sem chamar o Stripe. */
export const sessaoIdValido = (id: unknown): boolean => typeof id === "string" && RE_SESSAO.test(id);

export type Decisao =
  | { status: 200; corpo: { loja: string | null } }
  | { status: 404; corpo: Record<string, never> };

/** A metadata (sessão ou subscrição expandida) não diz a origem: é preciso ir buscar as line items. */
export function precisaDeLinhas(sessao: unknown, priceDireto: string, priceClick: string): boolean {
  return !!obj(sessao) && origemDaSessao(sessao, [], priceDireto, priceClick) === null;
}

/**
 * 200 { loja } se a sessão está `complete`, foi criada há menos de 24 h e é da porta Click
 * (metadata ou price_id, compat.ts); senão 404 {}. `linhas` são as line items (só precisas
 * quando a metadata não diz a origem).
 */
export function decidirResposta(sessao: unknown, agoraMs: number, priceDireto: string, priceClick: string, linhas: unknown = []): Decisao {
  const s = obj(sessao);
  if (!s) return { status: 404, corpo: {} };
  if (String(s.status ?? "") !== "complete") return { status: 404, corpo: {} };
  const criado = Number(s.created ?? 0);
  if (!criado || agoraMs - criado * 1000 > JANELA_HORAS * 3600e3) return { status: 404, corpo: {} };
  if (origemDaSessao(s, linhas, priceDireto, priceClick) !== "click") return { status: 404, corpo: {} };
  return { status: 200, corpo: { loja: lojaDaSessao(s as SessaoComCampos) } };
}

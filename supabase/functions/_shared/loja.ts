// Nome da loja/empresa indicado no checkout do plano Click (2026-11-08).
//
// O Payment Link Click tem um campo personalizado de texto ("Your store / company
// name (as registered with Click)"). O Stripe gera a `key` desse campo a partir do
// rótulo, por isso não se depende dela: usa-se o PRIMEIRO campo com type === "text"
// (se `type` faltar, o primeiro com text.value). Função pura, testada em loja.test.ts;
// usada pelo stripe-webhook (subscritores.loja) e pela função loja-click (mensagem
// de WhatsApp em bem-vindo-click.html).

export const LOJA_MAX = 80;

export interface CampoPersonalizado {
  key: string;
  type?: string;
  text?: { value?: string | null } | null;
}

export interface SessaoComCampos {
  custom_fields?: Array<CampoPersonalizado> | null;
}

/** trim, espaços colapsados, máx. 80 caracteres; vazio → null. */
export function normalizarLoja(valor: unknown): string | null {
  const limpo = String(valor ?? "").replace(/\s+/g, " ").trim().slice(0, LOJA_MAX).trim();
  return limpo || null;
}

/** Loja da sessão de checkout: primeiro campo personalizado de texto, normalizado; null se não houver. */
export function lojaDaSessao(s: SessaoComCampos | null | undefined): string | null {
  const campos = Array.isArray(s?.custom_fields) ? s!.custom_fields! : [];
  const campo = campos.find((c) => c && (c.type === "text" || (c.type == null && c.text?.value != null)));
  return campo ? normalizarLoja(campo.text?.value) : null;
}

// Compra Click (checkout.session.completed com origem click): grava os dados do checkout e decide o estado_click.
// Lógica sem rede nem Deno.env: tudo o que toca na base, no Auth, no Resend ou no relógio entra por `deps`
// (index.ts liga-as ao Supabase; compra_click.test.ts a uma base em memória).
//
// Desde 2026-11-13 (CLICK_AUTO_VALIDAR, por omissão ligado): acesso IMEDIATO, com rejeição posterior.
//   * compra nova (estado_click vazio)   → 'validado' + validado_auto_em = agora, e-mail de acesso logo
//                                           (boas-vindas; regresso para quem já as tinha recebido), alerta
//                                           "Click purchase — access granted automatically" com "Reject & refund";
//   * CLICK_AUTO_VALIDAR=false            → 'pendente', como antes (validação manual em admin.html);
//   * quem foi recusado e volta a comprar → 'pendente' (revisão manual), nunca validado automaticamente;
//   * evento repetido / já decidido       → nada muda (a escrita só acontece onde estado_click is null).
import { reabreRecusado } from "./click.ts";

/** CLICK_AUTO_VALIDAR: por omissão ligado; "false", "0", "no" ou "off" (sem distinguir maiúsculas) desligam. */
export function autoValidarClick(v: string | null | undefined): boolean {
  return !/^(false|0|no|off)$/i.test((v ?? "").trim());
}

/** A linha de subscritores que esta lógica lê. */
export interface LinhaClick {
  estado_click: "pendente" | "validado" | "recusado" | null;
  codigo_compra: string | null;
  user_id: string | null;
  boas_vindas_em: string | null;
  validado_auto_em: string | null;
  origem: string | null;
  estado: string | null;
  bloqueado_em: string | null;
  em_atraso_desde: string | null;
}

export interface CompraClick { email: string; codigo: string; telefone: string | null; nome: string | null; loja: string | null; sessao: string }

export interface DepsCompraClick {
  autoValidar: boolean;
  agora: () => string;
  ler: (email: string) => Promise<LinhaClick | null>;
  gravarDados: (email: string, d: { codigo_compra: string; telefone: string | null; nome: string | null; loja: string | null }) => Promise<void>;
  /** update … set campos where email = … and estado_click is null; true se mudou a linha. */
  marcarSeSemEstado: (email: string, campos: { estado_click: "validado" | "pendente"; validado_auto_em?: string }) => Promise<boolean>;
  /** update … set estado_click = 'pendente' where email = … and estado_click = 'recusado'; true se mudou. */
  reabrirRecusado: (email: string) => Promise<boolean>;
  garantirLogin: (email: string) => Promise<void>;
  /** E-mail de acesso (com reserva atómica nas boas-vindas); true se foi enviado. */
  enviarAcesso: (email: string, tipo: "boas_vindas" | "regresso") => Promise<boolean>;
  alertar: (assunto: string, linhas: string[], botao?: { texto: string; url: string }) => Promise<boolean>;
  /** admin.html filtrado nesta compra (pelo código, nunca pelo e-mail). */
  linkAdmin: (codigo: string) => string;
}

export async function registarCompraClick(deps: DepsCompraClick, c: CompraClick): Promise<Record<string, unknown>> {
  const antes = await deps.ler(c.email);
  // Checkout NOVO de quem tinha sido recusado (o código é outro): volta a pendente, para revisão manual.
  const reaberto = reabreRecusado(antes?.estado_click, antes?.codigo_compra, c.codigo) ? await deps.reabrirRecusado(c.email) : false;
  await deps.gravarDados(c.email, { codigo_compra: c.codigo, telefone: c.telefone, nome: c.nome, loja: c.loja });

  const auto = deps.autoValidar && !reaberto;
  const marcado = reaberto ? false : await deps.marcarSeSemEstado(c.email,
    auto ? { estado_click: "validado", validado_auto_em: deps.agora() } : { estado_click: "pendente" });

  // Login (também para o pendente: deixa-o pedir o link e ver "being confirmed"). Falhar não falha o evento.
  if (!antes?.user_id) { try { await deps.garantirLogin(c.email); } catch { /* o varrimento das boas-vindas repete */ } }

  // Acesso imediato: o e-mail de entrada sai já. Só quando ESTE evento fez a marcação (um evento repetido não reenvia).
  let acesso: "enviado" | "por_enviar" | null = null;
  if (auto && marcado) {
    const tipo = antes?.boas_vindas_em ? "regresso" : "boas_vindas";
    let ok = false;
    try { ok = await deps.enviarAcesso(c.email, tipo); } catch { ok = false; }
    acesso = ok ? "enviado" : "por_enviar"; // boas-vindas por enviar: o varrimento de 15 em 15 min repete-as
  }

  const dados = [
    `Purchase code: ${c.codigo}`, `Store: ${c.loja ?? "—"}`, `E-mail: ${c.email}`, `Phone: ${c.telefone ?? "— (not collected at checkout)"}`,
    `Name: ${c.nome ?? "—"}`, `Checkout session: ${c.sessao}`,
  ];
  const botaoAdmin = (texto: string) => ({ texto, url: deps.linkAdmin(c.codigo) });
  let enviado: boolean;
  if (auto && marcado) {
    enviado = await deps.alertar(`Click purchase — access granted automatically · ${c.codigo}`, [
      ...dados,
      `Access e-mail: ${acesso === "enviado" ? "sent" : "not sent yet (retried every 15 minutes)"}.`,
      `Tell Click: "${c.codigo} paid". If Click cannot confirm this client, use Reject & refund: full refund, subscription cancelled, access ends.`,
    ], botaoAdmin("Reject & refund"));
  } else if (reaberto) {
    enviado = await deps.alertar(`New Click subscription from a previously rejected buyer · ${c.codigo}`, [
      ...dados,
      "This buyer was rejected before, so access was NOT granted automatically. Validate or reject at admin.html.",
    ], botaoAdmin("Open in admin"));
  } else if (marcado) {
    enviado = await deps.alertar(`New Click subscription · ${c.codigo}`, [
      ...dados,
      `Confirm the payment, then tell Click: "${c.codigo} paid". Validate or reject at admin.html.`,
    ], botaoAdmin("Open in admin"));
  } else {
    // Já tinha estado_click (validado à mão, antigo cliente Click…): só se informa.
    enviado = await deps.alertar(`Click purchase · ${c.codigo} (status unchanged: ${antes?.estado_click ?? "—"})`, dados, botaoAdmin("Open in admin"));
  }

  const estado = reaberto ? "pendente" : marcado ? (auto ? "validado" : "pendente") : antes?.estado_click ?? null;
  return { codigo: c.codigo, estado, auto: auto && marcado, reaberto, acesso, email_enviado: enviado };
}

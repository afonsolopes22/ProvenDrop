// Regras puras do plano Click usadas pelo webhook (testadas em click.test.ts).

export type EstadoClick = "pendente" | "validado" | "recusado";

/**
 * Um checkout Click NOVO de quem tinha sido recusado volta a 'pendente' (senão a pessoa paga,
 * fica sem acesso e nem aparece em admin.html). O mesmo checkout processado outra vez (mesmo
 * código de compra) nunca reabre uma recusa já decidida.
 */
export function reabreRecusado(estadoAtual: string | null | undefined, codigoAtual: string | null | undefined, codigoNovo: string): boolean {
  return estadoAtual === "recusado" && !!codigoNovo && (codigoAtual ?? "") !== codigoNovo;
}

/** bloqueado_motivo de um reembolso total ("reembolso ch_…", compat.ts motivoBloqueio); as disputas não entram. */
export function bloqueadoPorReembolso(motivo: string | null | undefined): boolean {
  return /^reembolso\s/.test(motivo ?? "");
}

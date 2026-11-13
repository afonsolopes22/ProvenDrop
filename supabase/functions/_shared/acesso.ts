// Espelho de public.tem_acesso() (0009), partilhado pelo stripe-webhook e pelos testes do admin-click:
// não bloqueado; direto, ou click com estado_click = 'validado'; ativo, ou em atraso há menos de 7 dias (M1).
// A validação automática dos clientes Click (0016) não muda esta regra: só escreve 'validado' mais cedo.

export const TOLERANCIA_DIAS = 7;

export interface LinhaAcesso {
  origem: string | null;
  estado: string | null;
  estado_click: string | null;
  bloqueado_em: string | null;
  em_atraso_desde: string | null;
}

export function temAcesso(s: LinhaAcesso | null | undefined, agoraMs = Date.now()): boolean {
  if (!s || s.bloqueado_em) return false;
  const porta = s.origem === "direto" || (s.origem === "click" && s.estado_click === "validado");
  if (!porta) return false;
  if (s.estado === "ativo") return true;
  if (s.estado === "em_atraso" && s.em_atraso_desde) {
    return agoraMs - new Date(s.em_atraso_desde).getTime() < TOLERANCIA_DIAS * 864e5;
  }
  return false;
}

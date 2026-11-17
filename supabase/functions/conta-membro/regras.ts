// conta-membro · regras puras (testadas em regras.test.ts): 1 kit por dia em teste e "Start my plan now".

/** Dia (AAAA-MM-DD) no calendário de Lisboa. */
export function diaLisboa(d: Date = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Kit em teste: só da lista mais recente; o primeiro kit do dia fica registado e pode voltar a ser descarregado
 * nesse dia; um segundo kit diferente é recusado. Fora do teste esta função não serve kits (o bucket serve-os).
 */
export function decidirKit(i: { emTeste: boolean; pedido: string; daLista: string[]; jaHoje: string | null }):
  { ok: true; registar: boolean } | { ok: false; erro: "nao_em_teste" | "fora_da_lista" | "limite_diario" } {
  if (!i.emTeste) return { ok: false, erro: "nao_em_teste" };
  if (!i.daLista.includes(i.pedido)) return { ok: false, erro: "fora_da_lista" };
  if (i.jaHoje === null) return { ok: true, registar: true };
  return i.jaHoje === i.pedido ? { ok: true, registar: false } : { ok: false, erro: "limite_diario" };
}

/** Start my plan now: só para quem está em teste e com a subscrição ainda em trialing no Stripe. */
export function decidirComecar(i: { emTeste: boolean; statusStripe: string }): { ok: true } | { ok: false; erro: "nao_em_teste" | "ja_comecou" } {
  if (!i.emTeste) return { ok: false, erro: "nao_em_teste" };
  return i.statusStripe === "trialing" ? { ok: true } : { ok: false, erro: "ja_comecou" };
}

/** Adicionar cartão (teste sem cartão): as mesmas condições do Start my plan now. */
export function decidirAdicionarCartao(i: { emTeste: boolean; statusStripe: string }): { ok: true } | { ok: false; erro: "nao_em_teste" | "ja_comecou" } {
  return decidirComecar(i);
}

/**
 * "Start my plan" depois do teste (o teste acabou sem cartão, ou o teste já tinha sido usado): Checkout SEM teste.
 * Só para quem a Click já validou, sem plano a correr e sem bloqueio (reembolso, disputa).
 */
export function decidirAssinar(s: { origem: string; estado: string; estado_click: string | null; bloqueado_em: string | null }):
  { ok: true } | { ok: false; erro: "nao_permitido" | "ja_tem_plano" } {
  if (s.origem !== "click" || s.estado_click !== "validado" || s.bloqueado_em) return { ok: false, erro: "nao_permitido" };
  // 'incompleto' ainda tem uma subscrição no Stripe (ex.: a 1.ª cobrança depois do teste falhou): uma nova duplicava-a.
  return s.estado === "cancelado" ? { ok: true } : { ok: false, erro: "ja_tem_plano" };
}

// Regras puras do e-mail diário (testadas em estado.test.ts; o index.ts só as usa).

/**
 * Coleção aprovada: a MESMA regra da área de membros (app.js, `aprovada`): o estado diz "aprovada"
 * OU o veredito é 🟢. A rotina usa quatro estados ("nova", "a observar", "aprovada", "continua a bater");
 * "nova" e "continua a bater" podem vir com veredito 🟢 ANUNCIAR, e essas coleções aparecem como
 * "Approved" na área. Até 2026-11-10 o e-mail só olhava para o estado e mostrava-as como
 * "under observation" (🟡).
 */
export function aprovada(estado: string | null | undefined, veredito: string | null | undefined): boolean {
  return /aprov/i.test(estado ?? "") || /🟢/.test(veredito ?? "");
}

/** Data por extenso em Europe/Lisbon, em inglês: "Tuesday, 11 November". */
export function dataPorExtenso(d: Date = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "long", day: "numeric", month: "long" })
      .formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]),
  );
  return `${p.weekday}, ${p.day} ${p.month}`;
}

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

/**
 * Cabeçalho de uma coleção no e-mail: "Título · Nicho · Mercado". Quando o título limpo é igual ao
 * nicho (ex.: "Men's Fashion" na coleção e "Men's fashion" no nicho), o nome aparece uma só vez:
 * "Men's fashion · GB". A comparação ignora maiúsculas, o tipo de apóstrofo e espaços a mais.
 */
export function cabecalho(titulo: string | null | undefined, nicho: string | null | undefined, mercado: string | null | undefined): string {
  const norm = (v: string) => v.toLowerCase().replace(/[\u2018\u2019\u02BC`]/g, "'").replace(/\s+/g, " ").trim();
  const t = (titulo ?? "").trim(), n = (nicho ?? "").trim(), m = (mercado ?? "").trim();
  const partes = t && n && norm(t) === norm(n) ? [n, m] : [t, n, m];
  return partes.filter(Boolean).join(" · ");
}

// colecao-foto · regras puras (testadas em regras.test.ts).

/** id_curto: seis caracteres sem 0/O/1/I. */
export const idValido = (v: string | null | undefined): boolean => /^[A-HJ-NP-Z2-9]{6}$/.test(String(v ?? "").trim().toUpperCase());

/** Caminho da foto dentro do bucket público "fotos" deste projeto, ou null (outro sítio, outro bucket, "..", carateres estranhos). */
export function caminhoDaFoto(url: string | null | undefined, supabaseUrl: string): string | null {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/fotos/`;
  const u = String(url ?? "").trim();
  if (!u.startsWith(base)) return null;
  const c = u.slice(base.length);
  return /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(c) && !c.includes("..") && !c.includes("//") ? c : null;
}

/** Transformação do Storage (do lado do servidor): 32×24, recorte, qualidade baixa. Nunca sai desta função. */
export const urlMiniatura = (supabaseUrl: string, caminho: string): string =>
  `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/render/image/public/fotos/${caminho}?width=32&height=24&resize=cover&quality=40`;

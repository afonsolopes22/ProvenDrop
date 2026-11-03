// S5 · Verificação do cabeçalho x-cron-secret em tempo constante (compara os
// SHA-256 dos dois valores, byte a byte, sem sair cedo). Sem CRON_SECRET
// configurado nada é aceite.

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

export async function cronSecretOk(req: Request): Promise<boolean> {
  const esperado = Deno.env.get("CRON_SECRET") ?? "";
  const dado = req.headers.get("x-cron-secret") ?? "";
  if (!esperado) return false;
  const [a, b] = await Promise.all([sha256(esperado), sha256(dado)]);
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

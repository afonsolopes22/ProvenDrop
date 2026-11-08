// Código de compra curto "PD-XXXXXX" a partir do id da sessão de checkout do Stripe.
// O MESMO cálculo corre em bem-vindo-click.html (Web Crypto no browser) e aqui (Deno):
//   SHA-256 do id (UTF-8) → os primeiros 6 bytes → um caractere cada, pelo resto da
//   divisão por 32, num alfabeto sem 0/O/1/I (fácil de ditar e de ler no WhatsApp).
// Determinístico: o mesmo cs_… dá sempre o mesmo código; 32^6 ≈ 1,07 mil milhões de valores.

export const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function codigoDeCompra(sessionId: string): Promise<string> {
  const dados = new TextEncoder().encode(String(sessionId ?? "").trim());
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", dados));
  let s = "";
  for (let i = 0; i < 6; i++) s += ALFABETO[hash[i] % 32];
  return "PD-" + s;
}

export const CODIGO_RE = /^PD-[A-HJ-NP-Z2-9]{6}$/;

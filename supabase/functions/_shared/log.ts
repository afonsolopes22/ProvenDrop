// B5/S13 · Logs e respostas sem dados pessoais nem segredos.

/** Identificador estável de um e-mail para os logs (nunca o e-mail): "u:" + 10 hex do SHA-256. */
export async function idEmail(email: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase())));
  return "u:" + Array.from(h.slice(0, 5)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Nunca devolver chaves nem e-mails numa mensagem de erro. */
export function semSegredos(s: string): string {
  return String(s ?? "")
    .replace(/\b(re|sk_test|sk_live|rk_test|rk_live|whsec)_[A-Za-z0-9_-]+/g, "$1_…")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]+/g, "eyJ…")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<e-mail>")
    .slice(0, 400);
}

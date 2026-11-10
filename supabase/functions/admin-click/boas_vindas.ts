// admin-click · utilizador de Auth e boas-vindas de um cliente Click validado.
//
// Réplica mínima de garantirUtilizador / linkDeEntrada / enviarBoasVindas do
// stripe-webhook (não se importa do webhook para as duas funções não ficarem
// presas uma à outra): cria o login se não existir, gera o magic link por
// token_hash (só é consumido quando app.html corre verifyOtp, S12) e envia o
// e-mail com o molde partilhado (_shared/email.ts, moldeBoasVindasClick).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { enviarEmail, moldeBoasVindasClick } from "../_shared/email.ts";

const jaExiste = (m: string) => /already|exists|registered|duplicate/i.test(m);

/** Cria o utilizador de Auth se não existir e devolve o seu id (null se não for possível saber). */
export async function garantirUtilizador(admin: SupabaseClient, email: string, appUrl: string): Promise<string | null> {
  const criado = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!criado.error) return criado.data.user?.id ?? null;
  if (!jaExiste(criado.error.message) && criado.error.code !== "email_exists") throw criado.error;
  // Já existe: o id vem de id_utilizador (0010), que não gera link; generateLink (que invalida o
  // link anterior) só se usa se a função SQL ainda não existir.
  const id = await admin.rpc("id_utilizador", { p_email: email });
  if (!id.error) return (id.data as string | null) ?? null;
  const l = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: appUrl } });
  if (l.error) throw l.error;
  return l.data.user?.id ?? null;
}

/** Link de entrada por token_hash: só é consumido quando a página corre verifyOtp (S12). */
export async function linkDeEntrada(admin: SupabaseClient, email: string, appUrl: string): Promise<string> {
  const l = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: appUrl } });
  if (l.error) throw l.error;
  const th = l.data.properties?.hashed_token;
  if (!th) throw new Error("magic link sem hashed_token");
  return `${appUrl}${appUrl.includes("?") ? "&" : "?"}token_hash=${encodeURIComponent(th)}&type=magiclink`;
}

/** Gera o link e envia as boas-vindas Click. Lança se o Resend recusar (quem chama decide o que fazer). */
export async function enviarBoasVindasClick(admin: SupabaseClient, email: string, appUrl: string, minutos: string): Promise<void> {
  const link = await linkDeEntrada(admin, email, appUrl);
  await enviarEmail({ to: email, ...moldeBoasVindasClick(link, minutos) });
}

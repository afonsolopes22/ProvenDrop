// colecao-foto · Miniatura desfocada da foto de uma coleção, para a pré-visualização pública dos links /c/<id> (2026-11-28).
//
//   GET ?c=<id_curto>   → 200 image/jpeg, 32×24 px (a página aumenta-a com um desfoque forte: nunca dá para ver o produto
//                          ao pormenor); 400 id mal formado; 404 sem foto, coleção retirada ou inexistente (nunca se diz qual).
//
// A foto original fica no bucket público "fotos"; o seu endereço NUNCA vai para o navegador: esta função lê-o em feed_dia
// (service role), pede ao Storage uma versão reduzida (transformação de imagem do Supabase, do lado do servidor) e devolve
// só os bytes da miniatura. Não há redirecionamentos (revelariam o endereço). Regras puras em regras.ts (testadas).
// Sem dados pessoais. Pode ser vista por qualquer pessoa (é uma imagem pública por natureza), por isso CORS *.
//
// Deploy:  supabase functions deploy colecao-foto --no-verify-jwt
// Segredos: nenhum além de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (injetados).

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { semSegredos } from "../_shared/log.ts";
import { caminhoDaFoto, idValido, urlMiniatura } from "./regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const vazio = (status: number) => new Response(null, { status, headers: { ...CORS, "Cache-Control": "public, max-age=300" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return vazio(405);
  const id = new URL(req.url).searchParams.get("c") ?? "";
  if (!idValido(id)) return vazio(400);
  try {
    const q = await admin.from("feed_dia").select("imagem_url,retirada").eq("id_curto", id.trim().toUpperCase())
      .order("dia", { ascending: false }).order("ordem").limit(1).maybeSingle();
    if (q.error) throw q.error;
    const linha = q.data as { imagem_url: string | null; retirada: boolean | null } | null;
    const caminho = linha && linha.retirada !== true ? caminhoDaFoto(linha.imagem_url, SUPABASE_URL) : null;
    if (!caminho) return vazio(404);
    const r = await fetch(urlMiniatura(SUPABASE_URL, caminho));
    if (!r.ok) return vazio(404);
    const bytes = new Uint8Array(await r.arrayBuffer());
    return new Response(bytes, { status: 200, headers: { ...CORS, "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    console.error("colecao-foto:", semSegredos((e as Error).message));
    return vazio(404);
  }
});

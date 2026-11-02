// E-mail diário aos subscritores "direto" ativos.
//
// Chamada pelo pg_cron a cada hora certa (ver 0001_plataforma.sql). Só envia
// quando a hora em Europe/Lisbon for HORA_ENVIO e ainda não tiver enviado
// nesse dia; assim a mudança de hora não desalinha nada. Envia a lista MAIS
// RECENTE de feed_dia (a rotina publica ao fim da tarde; às 09:00 do dia
// seguinte sai a lista de ontem) e nunca envia a mesma lista duas vezes
// (envios_diarios.feed_dia). O e-mail NÃO leva links das lojas nem dos zips:
// só o resumo e um botão para a área.
//
// Deploy:  supabase functions deploy email-diario --no-verify-jwt
// Segredos: CRON_SECRET (igual ao valor em public.config), RESEND_API_KEY,
//   EMAIL_FROM, APP_URL, HORA_ENVIO (ex.: "9").
//
// Envio manual (teste):  POST …/email-diario?forcar=1  com x-cron-secret.

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { enviarEmails, esc, molde, type Mensagem } from "../_shared/email.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const APP_URL = Deno.env.get("APP_URL") ?? "https://afonsolopes22.github.io/ProvenDrop/app.html";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const HORA_ENVIO = Number.parseInt((Deno.env.get("HORA_ENVIO") ?? "-1").split(":")[0], 10);

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

interface Item {
  ordem: number; nicho: string | null; colecao: string | null; mercado_destaque: string | null;
  paises_ads: string[] | null; estado: string | null; alcance_eu: number | null;
  anuncios_ativos: number | null; dias_ativo: number | null; data_inicio: string | null;
  zip_url: string | null; zip_path: string | null;
}

/** Dia (AAAA-MM-DD) e hora inteira atuais em Europe/Lisbon. */
function agoraLisboa(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]),
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number.parseInt(p.hour, 10), ddmm: `${p.day}/${p.month}` };
}

const k = (n: number | null) => n == null ? "" : n >= 1000 ? `${Math.round(n / 1000)}k people` : `${Math.round(n)} people`;
const aprovada = (i: Item) => /aprov/i.test(i.estado ?? "");
const mercado = (i: Item) => i.mercado_destaque || (i.paises_ads?.[0] ?? "");
/** Dias contados até hoje quando há data_inicio; senão o valor da análise. */
function dias(i: Item): string {
  if (i.data_inicio) {
    const n = Math.floor((Date.now() - new Date(i.data_inicio + "T12:00:00Z").getTime()) / 864e5);
    if (Number.isFinite(n) && n >= 0) return `${n} days`;
  }
  return i.dias_ativo != null ? `${i.dias_ativo} days at analysis` : "";
}

function linhaTexto(i: Item): string {
  const cab = `${i.colecao ?? "Collection"} · ${mercado(i)}`.replace(/ · $/, "");
  if (!aprovada(i)) return `🟡 ${cab} — observing`;
  const partes = [
    i.anuncios_ativos != null ? `${i.anuncios_ativos} ads` : "",
    dias(i),
    k(i.alcance_eu),
    (i.zip_path || i.zip_url) ? "kit ready" : "",
  ].filter(Boolean);
  return `🟢 ${cab} — ${partes.join(" · ")}`;
}

function linhaHtml(i: Item): string {
  const t = linhaTexto(i);
  const [bola, resto] = [t.slice(0, 2), t.slice(3)];
  const [cab, det] = resto.split(" — ");
  return `<p style="margin:0 0 12px"><span>${bola}</span> <b>${esc(cab)}</b>${det ? `<br><span style="color:#5C645E">${esc(det)}</span>` : ""}</p>`;
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ erro: "não autorizado" }, 401);
  const forcar = new URL(req.url).searchParams.get("forcar") === "1";
  const { dia, hora, ddmm } = agoraLisboa();

  if (!forcar && hora !== HORA_ENVIO) return json({ ok: true, saltado: "fora da hora", hora, hora_envio: HORA_ENVIO });

  const ja = await admin.from("envios_diarios").select("dia,feed_dia").eq("dia", dia).maybeSingle();
  if (ja.error) return json({ erro: ja.error.message }, 500);
  if (ja.data && !forcar) return json({ ok: true, saltado: "já enviado hoje" });

  // Lista mais recente (nunca de um dia futuro).
  const ult = await admin.from("feed_dia").select("dia").lte("dia", dia).order("dia", { ascending: false }).limit(1).maybeSingle();
  if (ult.error) return json({ erro: ult.error.message }, 500);
  if (!ult.data) return json({ ok: true, saltado: "sem feed", dia });
  const feedDia = ult.data.dia as string;

  const repetido = await admin.from("envios_diarios").select("dia").eq("feed_dia", feedDia).limit(1);
  if (repetido.error) return json({ erro: repetido.error.message }, 500);
  if ((repetido.data?.length ?? 0) > 0 && !forcar) return json({ ok: true, saltado: "lista já enviada", feed_dia: feedDia });

  const feed = await admin.from("feed_dia")
    .select("ordem,nicho,colecao,mercado_destaque,paises_ads,estado,alcance_eu,anuncios_ativos,dias_ativo,data_inicio,zip_url,zip_path")
    .eq("dia", feedDia).order("ordem");
  if (feed.error) return json({ erro: feed.error.message }, 500);
  const itens = (feed.data ?? []) as Item[];
  if (!itens.length) return json({ ok: true, saltado: "feed vazio", feed_dia: feedDia });

  const subs = await admin.from("subscritores").select("email")
    .eq("origem", "direto").eq("estado", "ativo").not("user_id", "is", null);
  if (subs.error) return json({ erro: subs.error.message }, 500);

  const n = itens.length;
  const subject = `ProvenDrop · ${ddmm}: ${n} ${n === 1 ? "collection" : "collections"} today`;
  const rodape = "Store links and Launch Kits are only in your member area, after you sign in. To cancel: “Manage subscription”, in the member area.";
  const text = itens.map(linhaTexto).join("\n") + `\n\nOpen today's collections: ${APP_URL}\n\n${rodape}`;
  const html = molde(
    `${n} ${n === 1 ? "collection" : "collections"} today`,
    itens.map(linhaHtml).join(""),
    { texto: "Open today's collections", url: APP_URL },
    rodape,
  );

  const mensagens: Mensagem[] = (subs.data ?? []).map((s) => ({ to: s.email, subject, html, text }));
  const enviados = mensagens.length ? await enviarEmails(mensagens) : 0;

  const reg = await admin.from("envios_diarios").upsert({ dia, feed_dia: feedDia, enviados, enviado_em: new Date().toISOString() });
  if (reg.error) return json({ erro: reg.error.message }, 500);
  return json({ ok: true, dia, feed_dia: feedDia, colecoes: n, destinatarios: mensagens.length, enviados });
});

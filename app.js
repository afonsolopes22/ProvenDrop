/* ProvenDrop · member area (app.html). Loaded as an external file so the page
   can carry a strict Content-Security-Policy (no inline scripts). Values come
   from config.js (public only); access is decided by the RLS policies. */
(function(){
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const url = v => /^https?:\/\//i.test(String(v||"")) ? String(v) : "";
  const MARKETS = ["IT","ES","FR","DE","GB","US"];
  /* The six markets plus the countries also tracked by the routine (NL/AT/CH/HU): always shown by name, never "No data". */
  const PAIS = {IT:"Italy",ES:"Spain",FR:"France",DE:"Germany",GB:"United Kingdom",US:"United States",NL:"Netherlands",AT:"Austria",CH:"Switzerland",HU:"Hungary"};
  const EU = new Set(["IT","ES","FR","DE","NL","AT","HU"]);   /* countries covered by Meta's EU ad data (GB/US/CH are not) */
  const pais = c => { const k = String(c||"").trim().toUpperCase(); return k ? (PAIS[k] || k) : ""; };
  /* Niche values are stored as the Portuguese labels used by the research routine.
     Selectable niches (preferences): three since 2026-11-04 (jewellery left). Labels keep jewellery for older rows in the archive. */
  const NICHOS = [["Roupa Feminina","Women’s fashion"],["Roupa Masculina","Men’s fashion"],["House Decor","Home decoration"]];
  const NICHO_LABEL = Object.assign({ "joalharia": "Women’s jewellery" }, Object.fromEntries(NICHOS.map(([v, l]) => [v.toLowerCase(), l])));
  const nicho = v => NICHO_LABEL[String(v||"").trim().toLowerCase()] || String(v||"");
  const C = window.PROVENDROP_CONFIG || {};
  const HORA = String(C.DAILY_TIME||"").trim();
  const PORTAL = url(C.STRIPE_PORTAL_LINK);
  /* Returning members: only the dedicated monthly-only link (no fallback to the Direct link, which carries the joining fee). */
  const LINK_RETURN = url(C.STRIPE_LINK_RETURN);
  /* Optional public contact in the footer (CONTACT_EMAIL in config.js; empty = not shown). */
  { const mail = String(C.CONTACT_EMAIL||"").trim(), fc = $("#footContact");
    if(fc && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)){ fc.innerHTML = `<a class="font-semibold hover:text-ink" href="mailto:${esc(mail)}">${esc(mail)}</a>`; fc.hidden = false; } }
  const SIGNED_URL_SECONDS = 120;   /* S7: kit download links are valid for 2 minutes */
  const TOLERANCIA_DIAS = 7;        /* M1: days of access after the first failed payment */
  const fmt = n => n == null || n === "" ? "—" : Math.round(Number(n)).toLocaleString("en-GB");
  const score = n => n == null || n === "" ? "—" : (Math.round(Number(n)*10)/10).toFixed(1);
  const parse = v => { if(!v) return null; const d = new Date(String(v).length === 10 ? v+"T12:00:00" : v); return isNaN(d) ? null : d; };
  const dia = v => { const d = parse(v); return d ? d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}) : ""; };
  const diaCurto = v => { const d = parse(v); return d ? d.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}) : ""; };
  const aprovada = r => /aprov/i.test(r.estado||"") || /🟢/.test(r.veredito||"");
  /* Ads per platform (0005). Meta ads = anuncios_meta, or anuncios_ativos − anuncios_google when only the total is known
     (rows published before 2026-11-02 only have anuncios_ativos, which were Meta). Google ads = anuncios_google. */
  const googleAds = r => r.anuncios_google != null ? r.anuncios_google : 0;
  const metaAds = r => r.anuncios_meta != null ? r.anuncios_meta : (r.anuncios_ativos != null ? Math.max(0, Number(r.anuncios_ativos) - (r.anuncios_google != null ? Number(r.anuncios_google) : 0)) : null);
  /* Reach comes from Meta's EU ad data. Rules (2026-11-08), Today and Library alike: the number only when
     alcance_eu > 0, never a false "0". Google-only store → "Google ads · reach not public". Meta ads without
     EU reach (ads only in the UK/US/CH) → "Not public (UK)" after the strongest market. */
  const adCountries = r => (Array.isArray(r.paises_ads) && r.paises_ads.length ? r.paises_ads : [r.mercado_destaque]).map(c => String(c||"").toUpperCase()).filter(Boolean);
  const MK_CURTO = { GB: "UK", US: "US", CH: "CH" };
  const REACH_TIP = 'title="Reach is only published for Meta ads in the EU."';
  const reach = r => {
    const m = Number(metaAds(r)) || 0, g = Number(googleAds(r)) || 0, a = r.alcance_eu == null || r.alcance_eu === "" ? null : Number(r.alcance_eu);
    if(a > 0) return `<span ${REACH_TIP}>${fmt(a)}</span>`;
    const nota = t => `<span class="sub !text-inherit" ${REACH_TIP}>${t}</span>`;
    if(m === 0 && g > 0) return nota("Google ads · reach not public");
    if(m > 0){
      const cs = adCountries(r), mk = String(r.mercado_destaque||"").toUpperCase();
      const fora = MK_CURTO[mk] || (cs.length && cs.every(c => !EU.has(c)) ? (MK_CURTO[cs[0]] || cs[0]) : "");
      return nota(`Not public${fora ? ` (${esc(fora)})` : ""}`);
    }
    return nota("No Meta data");
  };
  /* Collection link: always the full collection URL (link_colecao, with or without "https://"), opened in a new
     tab; the visible text is the host plus the path ("store.it/collections/handle"), shortened. Never the store home. */
  const ligacao = r => {
    let v = String(r.link_colecao||"").trim(); if(!v) return null;
    if(!/^https?:\/\//i.test(v)) v = "https://" + v;
    let u; try { u = new URL(v); } catch { return null; }
    if(!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    const p = u.pathname.replace(/\/+$/, ""); let t = u.hostname.replace(/^www\./, "") + (p && p !== "/" ? p : "");
    if(t.length > 46) t = t.slice(0, 44) + "…";
    return { href: u.href, texto: t };
  };
  const diaMes = v => { const d = parse(v); return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; };
  /* The routine's internal note name ("2026-10-30 — Niche — Collection (store)") is never shown; only its date, as "Analysed 30 Oct". */
  const analisado = r => { const m = String(r.nota||"").match(/^\s*(\d{4}-\d{2}-\d{2})/); return m ? diaMes(m[1]) : ""; };
  const chave = r => `${String(r.loja||"").trim().toLowerCase()}|${String(r.colecao||"").trim().toLowerCase()}`;
  const plats = r => {
    const p = (Array.isArray(r.plataformas) ? r.plataformas : []).map(s => String(s).toLowerCase()).filter(s => s === "meta" || s === "google");
    if(p.length) return [...new Set(p)];
    const d = []; if(Number(metaAds(r)) > 0) d.push("meta"); if(Number(googleAds(r)) > 0) d.push("google");
    return d.length ? d : ["meta"];
  };
  const ICON = {
    meta: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 12c-1.8-3.6-3.3-5.5-5.5-5.5S3 9.5 3 12s1.3 5.5 3.5 5.5S10.2 15.6 12 12s3.3-5.5 5.5-5.5S21 9.5 21 12s-1.3 5.5-3.5 5.5S13.8 15.6 12 12z"/></svg>',
    google: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20.5 12H12"/><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/></svg>',
  };
  const chips = (r, cls) => `<ul class="plats flex flex-wrap gap-1${cls ? " " + cls : ""}" aria-label="Advertising platforms">${plats(r).map(p => `<li class="plat ${p}">${ICON[p]}${p === "meta" ? "Meta" : "Google"}</li>`).join("")}</ul>`;
  /* S7: a kit is only offered through the private bucket (zip_path); external zip links are never shown. */
  const temKit = r => !!r.zip_path;
  /* Days advertising: counted up to today when data_inicio exists; otherwise the value measured at analysis. */
  const diasAgora = r => { const d = parse(r.data_inicio); if(!d) return null; const n = Math.floor((Date.now() - d.getTime()) / 864e5); return n >= 0 ? n : null; };
  const dias = r => { const n = diasAgora(r); return n != null ? fmt(n) : `${fmt(r.dias_ativo)}<small class="at">at analysis</small>`; };

  /* Mirror of public.tem_acesso(): direct, not blocked, active or overdue for less than 7 days. */
  const diasAtraso = s => s?.em_atraso_desde ? Math.floor((Date.now() - new Date(s.em_atraso_desde).getTime()) / 864e5) : null;
  const temAcesso = s => !!s && s.origem === "direto" && !s.bloqueado_em && (s.estado === "ativo" || (s.estado === "em_atraso" && diasAtraso(s) != null && diasAtraso(s) < TOLERANCIA_DIAS));

  const views = ["vConfig","vLogin","vSemAcesso","vApp"];
  function show(id){ views.forEach(v => { $("#"+v).hidden = v !== id; }); const app = id === "vApp"; $("#tabs").hidden = !app; }
  function msg(el, texto, tipo){ el.textContent = texto; el.className = "msg" + (tipo ? " "+tipo : ""); el.hidden = !texto; }

  const SB_URL = String(C.SUPABASE_URL||"").trim(), SB_KEY = String(C.SUPABASE_ANON_KEY||"").trim();
  if(!/^https:\/\//.test(SB_URL) || !SB_KEY || !window.supabase){ show("vConfig"); return; }
  /* S12: PKCE instead of implicit (no tokens in the URL fragment). */
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true } });

  let user = null, sub = null, feedRows = [], feedTodos = [], verdes = null, retiradas = new Set();
  /* Collections withdrawn after being sent (0007: feed_dia.retirada = true; the store was excluded, the verdict
     dropped, the link died). Never shown and no kit offered. A store+collection whose newest sending is withdrawn
     disappears everywhere: Today, Earlier this week, the Library and its verdes entry. */
  const visivel = r => r.retirada !== true && !retiradas.has(chave(r));

  /* ── session ────────────────────────────────────────────────────── */
  /* Sign-in links from our e-mails carry ?token_hash=…&type=magiclink: they are only
     consumed here, by verifyOtp, so an e-mail scanner that opens the URL does not burn them. */
  async function entrarPorTokenHash(){
    const q = new URLSearchParams(location.search);
    const th = q.get("token_hash"), tipo = q.get("type");
    if(!th) return false;
    history.replaceState(null, "", location.pathname);
    const { error } = await sb.auth.verifyOtp({ token_hash: th, type: tipo === "recovery" ? "recovery" : "magiclink" });
    if(error){ show("vLogin"); msg($("#msgLogin"), "This sign-in link is no longer valid. Request a new one below.", "erro"); }
    return !error;
  }

  $("#formLogin").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#email").value.trim().toLowerCase(), m = $("#msgLogin"), b = $("#btnLogin");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg(m, "Enter a valid e-mail address.", "erro");
    b.disabled = true; msg(m, "Sending…");
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
    b.disabled = false;
    /* S11: neutral answer, whether or not the e-mail has an account. */
    if(error && !/signup|not allowed|not found|user/i.test(error.message)) return msg(m, "The link could not be sent right now. Please try again in a minute.", "erro");
    msg(m, "If this e-mail has a ProvenDrop subscription, a sign-in link is on its way. Open it on this device. Check the spam folder too.");
  });
  $("#btnSair").addEventListener("click", async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); });

  sb.auth.onAuthStateChange((_ev, session) => { if(session?.user?.id !== user?.id) entrar(session); });
  entrarPorTokenHash().then(ok => { if(!ok) sb.auth.getSession().then(({ data }) => entrar(data.session)); });

  const CAMPOS = "email,origem,estado,nichos,paises,guia_visto,criado_em,em_atraso_desde,acesso_fim,bloqueado_em,boas_vindas_em";
  async function entrar(session){
    user = session?.user || null;
    if(!user){ sub = null; $("#who").hidden = true; show("vLogin"); return; }
    $("#whoEmail").textContent = user.email || ""; $("#who").hidden = false;
    const { data, error } = await sb.from("subscritores").select(CAMPOS).eq("user_id", user.id).maybeSingle();
    sub = error ? null : data;
    if(!temAcesso(sub)) return semAcesso();
    show("vApp");
    renderConta(); renderPrefsForm(); renderAvisos();
    if(!sub.guia_visto) abrirGuia(); else mostrarDica();
    carregarHoje();
  }

  function semAcesso(){
    const t = $("#semTitulo"), p = $("#semTexto"), g = $("#semPortal"), r = $("#semRegresso"), s = $("#semSubscrever");
    r.hidden = true; s.hidden = false;
    if(!sub){ t.textContent = "No active subscription"; p.textContent = "This e-mail has an account but is not linked to an active ProvenDrop subscription. If you have just paid, wait a minute and reload the page."; }
    else if(sub.bloqueado_em){ t.textContent = "Access suspended"; p.textContent = "Your access was suspended because of a payment dispute. Reply to any ProvenDrop e-mail and we sort it out with you."; s.hidden = true; }
    else if(sub.estado === "incompleto"){ t.textContent = "Payment not completed"; p.textContent = "Your payment was started but not completed (for example, the bank confirmation was not finished). Nothing was charged yet. Subscribe again to complete it."; }
    else if(sub.estado === "em_atraso"){ t.textContent = "Payment overdue"; p.textContent = "The last payment failed and the " + TOLERANCIA_DIAS + "-day grace period is over. Update your card in “Manage subscription” and your access comes back as soon as the payment goes through."; }
    else if(sub.estado === "cancelado"){ t.textContent = "Subscription cancelled"; const volta = !!(LINK_RETURN && sub.boas_vindas_em); p.textContent = volta ? "Your subscription was cancelled. You can come back whenever you want: as a former member you only pay the monthly fee, not the joining fee again." : "Your subscription was cancelled. You can subscribe again whenever you want."; if(volta){ r.href = LINK_RETURN; r.hidden = false; s.hidden = true; } }
    else { t.textContent = "No access to the member area"; p.textContent = "Click customers receive the collections in the Click WhatsApp group, not in this area."; }
    g.hidden = !PORTAL || !sub; if(PORTAL) g.href = PORTAL;
    show("vSemAcesso");
  }

  /* Banners inside the area: overdue payment (days left) and scheduled end (B4). */
  function renderAvisos(){
    const a = $("#aviso"); a.hidden = true; a.textContent = "";
    if(sub.estado === "em_atraso"){ const left = Math.max(0, TOLERANCIA_DIAS - (diasAtraso(sub) ?? 0)); a.textContent = "Your last payment failed. You keep access for " + left + " more " + (left === 1 ? "day" : "days") + ". Update your card in Subscription → Manage subscription."; a.hidden = false; }
    else if(sub.acesso_fim){ a.textContent = "Your subscription is cancelled and ends on " + dia(sub.acesso_fim) + ". You keep access until then."; a.hidden = false; }
  }

  /* ── tabs ───────────────────────────────────────────────────────── */
  const paineis = { hoje:"#tHoje", arquivo:"#tArquivo", prefs:"#tPrefs", conta:"#tConta" };
  function go(tab){
    Object.entries(paineis).forEach(([k, s]) => { $(s).hidden = k !== tab; });
    document.querySelectorAll("#tabs [data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
    if(tab === "arquivo" && !verdes) carregarArquivo();
    scrollTo({ top: 0 });
  }
  $("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if(b) go(b.dataset.tab); });
  document.addEventListener("click", e => { const a = e.target.closest("[data-go]"); if(a){ e.preventDefault(); go(a.dataset.go); } });

  /* ── today ──────────────────────────────────────────────────────── */
  async function carregarHoje(){
    const feed = $("#feed");
    feed.innerHTML = '<div class="empty">Loading…</div>';
    /* One query serves the latest list, "Earlier this week" and the Library: every sending, newest first
       (PostgREST returns at most 1000 rows, i.e. the most recent ones; enough for many months of lists). */
    const { data, error } = await sb.from("feed_dia").select("*").order("dia", { ascending: false }).order("ordem");
    if(error){ feed.innerHTML = '<div class="empty">The collections could not be loaded right now.</div>'; return; }
    feedTodos = data || [];
    retiradas = new Set(); { const vistas = new Set(); for(const r of feedTodos){ const k = chave(r); if(vistas.has(k)) continue; vistas.add(k); if(r.retirada === true) retiradas.add(k); } }
    if(!feedTodos.length){ feed.innerHTML = '<div class="empty">No collections published yet. ' + (HORA ? "They arrive every day at " + esc(HORA) + "." : "") + '</div>'; return; }
    const d = feedTodos[0].dia;
    feedRows = feedTodos.filter(r => r.dia === d && visivel(r));
    const hoje = new Date().toISOString().slice(0,10);
    $("#hojeTitulo").textContent = d === hoje ? "Today’s collections" : "Collections for " + dia(d);
    $("#hojeSub").textContent = d === hoje ? dia(d) : "There is no list for today yet; this is the most recent one.";
    $("#hojeHora").textContent = HORA ? "New collections every day at " + HORA : "";
    renderFeed(); renderSemana(d);
    if(verdes) renderArquivo();
  }

  /* Preferred niches first (the stored countries are no longer used to order or filter anything, 2026-11-08). */
  const porPreferencia = rows => { const pref = new Set((sub?.nichos||[]).map(s => s.toLowerCase())); return rows.slice().sort((a,b) => (pref.has(String(b.nicho||"").toLowerCase()) - pref.has(String(a.nicho||"").toLowerCase())) || (a.ordem - b.ordem)); };
  /* High-density table (one row per collection) inside the dark panel; stacked key/value blocks under 768px (.dt). */
  const tabela = (rows, opts) => `<table class="dt dt-dark"><thead><tr><th>Status</th><th>Collection · kit</th><th>Niche · market</th><th class="text-right" title="Meta ads">Meta</th><th class="text-right" title="Google ads">Google</th><th class="text-right">Days</th><th class="text-right" title="Meta reach">Reach</th><th>Markets</th><th class="text-right">Score</th></tr></thead><tbody>${rows.map(r => cartao(r, opts)).join("")}</tbody></table>`;

  function renderFeed(){
    const rows = porPreferencia(feedRows);
    $("#feed").innerHTML = rows.length ? tabela(rows) : '<div class="empty">No collections on this day.</div>';
    /* KPI strip above the table (counts only; nothing else is computed here) */
    const kpi = (id, v) => { const el = $(id); if(el) el.textContent = String(v); };
    kpi("#kpiTotal", rows.length); kpi("#kpiOk", rows.filter(aprovada).length); kpi("#kpiWatch", rows.filter(r => !aprovada(r)).length); kpi("#kpiKits", rows.filter(temKit).length);
  }

  /* "Earlier this week": the collections sent in the 7 days before the list shown, one row per store+collection
     (the newest sending wins), same row format and kit as the daily list. Hidden when there are none. */
  function renderSemana(d){
    const sec = $("#semana"), lim = parse(d); if(!lim){ sec.hidden = true; return; }
    const ini = new Date(lim.getTime() - 7 * 864e5), vistos = new Set(feedRows.map(chave)), rows = [];
    for(const r of feedTodos){ if(r.dia >= d) continue; const dd = parse(r.dia); if(!dd || dd < ini) break; if(!visivel(r)) continue; const k = chave(r); if(vistos.has(k)) continue; vistos.add(k); rows.push(r); }
    sec.hidden = !rows.length; if(!rows.length) return;
    $("#semanaSub").textContent = rows.length + (rows.length === 1 ? " collection" : " collections") + " from the previous 7 days, each with its kit.";
    $("#semanaBox").innerHTML = tabela(porPreferencia(rows), { dia: true });
  }

  /* Six-market strip; a strongest market outside the six (NL/AT/CH/HU) is added as a seventh cell so it is never lost. */
  function strip(mk, verdes){ const ok = new Set([mk, ...(verdes||[])].filter(Boolean).map(s => String(s).toUpperCase())); const cols = MARKETS.concat(mk && !MARKETS.includes(mk) ? [mk] : []); return `<ul class="strip" aria-label="Markets"${cols.length > 6 ? ` style="grid-template-columns:repeat(${cols.length},minmax(0,1fr))"` : ""}>${cols.map(c => `<li${ok.has(c) ? ' class="ok"' : ''} title="${esc(pais(c))}">${esc(c)}</li>`).join("")}</ul>`; }
  /* Score of the strongest market, shown next to the global score so it is clear why a collection is approved
     ("7.3 in CH"): the market named in a 🟢 verdict, else mercado_destaque; the routine's per-market score when
     the row carries one (scores_mercado), else the collection score. */
  const mercadoDoVeredito = r => { const m = String(r.veredito||"").match(/🟢[^()]*\(([A-Z]{2})\)/); return m ? m[1] : ""; };
  const scoreMercado = r => { const mk = mercadoDoVeredito(r) || String(r.mercado_destaque||"").toUpperCase(); const porMk = mk && r.scores_mercado && typeof r.scores_mercado === "object" ? r.scores_mercado[mk] : null; return { valor: score(porMk != null ? porMk : r.score), mk, proprio: porMk != null }; };

  /* Every collection in the list comes with its kit (approved and under observation) since 2026-11-02.
     One table row per collection (classes are Tailwind utilities + the .dt/.status/.plat components in src/tailwind.css).
     opts.dia adds the sending day under the status ("Earlier this week"). */
  function cartao(r, opts){
    const ok = aprovada(r), lk = ligacao(r), an = analisado(r), mk = String(r.mercado_destaque||"").toUpperCase();
    const pref = (sub?.nichos||[]).some(n => n.toLowerCase() === String(r.nicho||"").toLowerCase());
    const kit = temKit(r) ? `<button class="btn btn-go btn-sm whitespace-normal text-left" type="button" data-zip="${esc(r.zip_path)}">Download Launch Kit${ok ? "" : " (under observation)"}</button>`
                          : `<span class="nota text-[12px] font-medium text-white/50">Kit being prepared</span>`;
    const adv = Number(googleAds(r)) > 0 && r.anunciante_google ? `<span class="adv sub mt-1 !text-white/80">Advertiser: ${esc(r.anunciante_google)}</span>` : "";
    return `<tr class="${pref ? "pref-first" : ""}">
      <td data-l="Status"><span class="status ${ok ? "go" : "watch"}">${ok ? "Approved" : "Under observation"}</span>${ok ? "" : `<span class="obs mt-2 block max-w-[20ch] text-[12px] font-medium leading-snug text-amber-200/90">Under observation — test with a small budget</span>`}${opts?.dia ? `<span class="sub mt-2">Sent ${esc(diaMes(r.dia))}</span>` : ""}${chips(r, "mt-2")}</td>
      <td data-l="Collection"><div class="min-w-[160px] max-w-[240px]"><h3 class="text-[16px] font-bold leading-snug text-white">${esc(r.colecao || "Collection")}</h3><p class="shop mt-1 break-all text-[12px]">${lk ? `<a href="${esc(lk.href)}" target="_blank" rel="noopener">${esc(lk.texto)}</a>` : `<span class="text-white/50">${esc(r.loja || "")}</span>`}</p>${an ? `<p class="sub mt-1.5">Analysed ${esc(an)}</p>` : ""}<div class="mt-2.5">${kit}</div></div></td>
      <td data-l="Niche"><div class="min-w-[124px]"><b class="font-semibold text-white">${esc(nicho(r.nicho))}</b>${mk ? `<span class="sub">strongest in ${esc(pais(mk))}</span>` : ""}${adv}</div></td>
      <td class="n md:text-right" data-l="Meta ads">${fmt(metaAds(r))}</td>
      <td class="n md:text-right" data-l="Google ads">${fmt(googleAds(r))}</td>
      <td class="n md:text-right" data-l="Days">${dias(r)}</td>
      <td class="n md:text-right" data-l="Meta reach">${reach(r)}</td>
      <td data-l="Markets"><div class="min-w-[132px]">${strip(mk, r.mercados_verdes)}<span class="sub mt-1.5">${r.trends_validados != null ? `Demand: ${esc(r.trends_validados)} of 6 markets` : "Demand: no data"}</span></div></td>
      <td class="n md:text-right" data-l="Score"><span class="text-[22px] font-extrabold leading-none tracking-tight text-white">${score(r.score)}</span><span class="sub">/ 10</span></td>
    </tr>`;
  }

  /* kits: short-lived signed URL from the private bucket; only works for members with access (RLS) */
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-zip]"); if(!b) return;
    b.disabled = true; const t = b.textContent; b.textContent = "Preparing…";
    const { data, error } = await sb.storage.from("kits").createSignedUrl(b.dataset.zip, SIGNED_URL_SECONDS);
    b.disabled = false; b.textContent = t;
    if(error || !data?.signedUrl) return alert("The kit could not be prepared. Please try again.");
    const a = document.createElement("a"); a.href = data.signedUrl; a.rel = "noopener"; a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove();
  });

  /* ── library (was "Archive" until 2026-11-08) ───────────────────── */
  async function carregarArquivo(){
    const box = $("#arqBox"); box.innerHTML = '<div class="empty">Loading…</div>';
    const { data, error } = await sb.from("verdes").select("*").order("data_aprovacao", { ascending: false });
    if(error){ box.innerHTML = '<div class="empty">The library could not be loaded right now.</div>'; return; }
    verdes = data || [];
    const rows = biblioteca();
    const nichos = [...new Set(rows.map(r => r.nicho).filter(Boolean))], paises = [...new Set(rows.map(r => String(r.mercado_destaque||"").toUpperCase()).filter(Boolean))].sort();
    $("#fNicho").innerHTML = '<option value="">All</option>' + nichos.map(n => `<option value="${esc(n)}">${esc(nicho(n))}</option>`).join("");
    $("#fPais").innerHTML = '<option value="">All</option>' + paises.map(p => `<option value="${esc(p)}">${esc(pais(p))}</option>`).join("");
    renderArquivo();
  }
  /* Library rows: every collection we have sent (feed_dia, one row per store+collection, the newest sending wins),
     carrying the kit of the day it was sent, enriched with the tracking data of the approved archive (verdes: approval
     date, still advertising, last check). Approved collections never in a daily list (before the platform) come from
     verdes alone, without a kit. Withdrawn collections (retirada) are left out, verdes entry included.
     Order: still advertising first, then score. */
  function biblioteca(){
    const porChave = new Map();
    for(const r of feedTodos){ if(!visivel(r)) continue; const k = chave(r); if(!porChave.has(k)) porChave.set(k, Object.assign({}, r, { enviado_em: r.dia })); }
    for(const v of verdes||[]){
      const k = chave(v), f = porChave.get(k); if(retiradas.has(k)) continue;
      if(f) Object.assign(f, { estado: "aprovada", data_aprovacao: v.data_aprovacao, ainda_a_anunciar: v.ainda_a_anunciar, anuncios_ultima_verificacao: v.anuncios_ultima_verificacao, ultima_verificacao: v.ultima_verificacao, scores_mercado: v.scores_mercado ?? f.scores_mercado, zip_path: f.zip_path || v.zip_path || null });
      else porChave.set(k, Object.assign({}, v, { estado: v.estado || "aprovada", enviado_em: v.data_aprovacao }));
    }
    return [...porChave.values()].sort((a, b) => ((b.ainda_a_anunciar === true) - (a.ainda_a_anunciar === true)) || ((Number(b.score) || 0) - (Number(a.score) || 0)) || String(b.enviado_em||"").localeCompare(String(a.enviado_em||"")));
  }
  ["#fNicho","#fPais","#fPlat","#fAtivas"].forEach(s => $(s).addEventListener("change", renderArquivo));
  /* Platform filter: "meta" / "google" = advertises there (alone or with the other); "both" = on both.
     plats() reads plataformas / anuncios_meta / anuncios_google, so a Google-only store is never shown as Meta. */
  const plataformaOk = (r, pl) => !pl || (pl === "both" ? plats(r).length === 2 : plats(r).includes(pl));
  function renderArquivo(){
    const n = $("#fNicho").value, p = $("#fPais").value, pl = $("#fPlat").value, so = $("#fAtivas").checked;
    const rows = biblioteca().filter(r => (!n || r.nicho === n) && (!p || String(r.mercado_destaque||"").toUpperCase() === p) && plataformaOk(r, pl) && (!so || r.ainda_a_anunciar === true));
    if(!rows.length){ $("#arqBox").innerHTML = '<div class="empty" style="border:0">No collections match these filters.</div>'; return; }
    $("#arqBox").innerHTML = `<table class="dt"><thead><tr><th>Sent</th><th>Status</th><th>Collection</th><th>Niche</th><th>Market</th><th class="text-right">Score</th><th class="text-right">Ads</th><th>Platforms</th><th class="text-right" title="Meta reach">Reach</th><th class="text-right">Days advertising</th><th>Still advertising</th><th>Kit</th></tr></thead><tbody>${rows.map(r => {
      const ok = aprovada(r), lk = ligacao(r), an = analisado(r), mk = String(r.mercado_destaque||"").toUpperCase(), sc = scoreMercado(r);
      const kit = temKit(r) ? `<button class="btn btn-go btn-sm whitespace-normal text-left" type="button" data-zip="${esc(r.zip_path)}">Download Launch Kit</button>` : "—";
      return `<tr>
        <td class="n whitespace-nowrap" data-l="Sent"><span>${esc(diaCurto(r.enviado_em) || "—")}${r.data_aprovacao && r.data_aprovacao !== r.enviado_em ? `<span class="sub">approved ${esc(diaCurto(r.data_aprovacao))}</span>` : ""}</span></td>
        <td data-l="Status"><span class="status ${ok ? "go" : "watch"}">${ok ? "Approved" : "Under observation"}</span></td>
        <td data-l="Collection"><span class="block min-w-[14ch] max-w-[260px]">${lk ? `<a class="text-[15px] font-bold leading-snug no-underline hover:underline" href="${esc(lk.href)}" target="_blank" rel="noopener">${esc(r.colecao)}</a>` : `<span class="text-[15px] font-bold leading-snug text-ink">${esc(r.colecao)}</span>`}${lk ? `<a class="sub break-all font-medium no-underline hover:underline" href="${esc(lk.href)}" target="_blank" rel="noopener">${esc(lk.texto)}</a>` : `<span class="sub">${esc(r.loja||"")}</span>`}${an ? `<span class="sub">Analysed ${esc(an)}</span>` : ""}</span></td>
        <td data-l="Niche"><span>${esc(nicho(r.nicho))}</span></td>
        <td data-l="Market"><span>${esc(pais(mk) || "—")}</span></td>
        <td class="n md:text-right" data-l="Score"><span class="whitespace-nowrap"><b class="font-extrabold">${score(r.score)}</b>${sc.mk ? `<span class="sub" title="${sc.proprio ? "Score for" : "Approved for"} ${esc(pais(sc.mk))}, the strongest market">${sc.proprio ? `${sc.valor} in ${esc(sc.mk)}` : `for ${esc(sc.mk)}`}</span>` : ""}</span></td>
        <td class="n md:text-right" data-l="Ads"><span><span class="whitespace-nowrap">${fmt(r.anuncios_ativos)} when sent</span>${Number(googleAds(r)) > 0 ? `<span class="sub">${fmt(googleAds(r))} on Google</span>` : ""}${r.anuncios_ultima_verificacao != null ? `<span class="sub">${fmt(r.anuncios_ultima_verificacao)} on ${esc(diaCurto(r.ultima_verificacao) || "—")}</span>` : ""}</span></td>
        <td data-l="Platforms"><span>${chips(r)}</span></td>
        <td class="n md:text-right" data-l="Meta reach"><span>${reach(r)}</span></td>
        <td class="n md:text-right" data-l="Days advertising"><span>${dias(r)}</span></td>
        <td data-l="Still advertising"><span>${r.ainda_a_anunciar === true ? "Yes" : r.ainda_a_anunciar === false ? "No" : "—"}</span></td>
        <td data-l="Kit"><span>${kit}</span></td>
      </tr>`; }).join("")}</tbody></table>`;
  }

  /* ── preferences ────────────────────────────────────────────────── */
  /* Niches only, and optional (2026-11-08). "Countries you sell in" was removed: subscritores.paises stays in the
     database untouched but is neither shown nor used. */
  function renderPrefsForm(){
    const n = new Set(sub?.nichos||[]);
    $("#prefNichos").innerHTML = NICHOS.map(([v,l]) => `<label class="check"><input type="checkbox" name="nicho" value="${esc(v)}"${n.has(v) ? " checked" : ""}> ${esc(l)}</label>`).join("");
  }
  $("#formPrefs").addEventListener("submit", async e => {
    e.preventDefault();
    const nichos = [...document.querySelectorAll('input[name="nicho"]:checked')].map(i => i.value);
    const { error } = await sb.from("subscritores").update({ nichos }).eq("user_id", user.id);
    if(error) return msg($("#msgPrefs"), "The preferences could not be saved right now.", "erro");
    sub.nichos = nichos; mostrarDica();
    msg($("#msgPrefs"), "Preferences saved."); renderFeed(); if(feedRows.length) renderSemana(feedRows[0].dia);
  });
  /* Discreet tip on Today while no niche is chosen; closing it is remembered in this browser only. */
  const DICA_KEY = "pd_dica_nichos_fechada";
  const dicaFechada = () => { try { return localStorage.getItem(DICA_KEY) === "1"; } catch { return false; } };
  function mostrarDica(){ $("#hojePrefs").hidden = !!(sub?.nichos||[]).length || dicaFechada(); }
  $("#hojePrefsFechar").addEventListener("click", () => { try { localStorage.setItem(DICA_KEY, "1"); } catch { /* private mode */ } $("#hojePrefs").hidden = true; });

  /* ── subscription ───────────────────────────────────────────────── */
  function renderConta(){
    $("#contaEmail").textContent = sub.email;
    const estado = { ativo: sub.acesso_fim ? "Active until " + dia(sub.acesso_fim) + " (cancelled)" : "Active", em_atraso: "Payment overdue (" + Math.max(0, TOLERANCIA_DIAS - (diasAtraso(sub) ?? 0)) + " days of access left)", cancelado: "Cancelled", incompleto: "Payment not completed" }[sub.estado] || sub.estado;
    $("#contaEstado").textContent = estado;
    $("#contaDesde").textContent = dia(sub.criado_em) || "—";
    const g = $("#contaPortal"); g.hidden = !PORTAL; if(PORTAL) g.href = PORTAL;
    $("#contaNota").textContent = PORTAL ? "In “Manage subscription” you change your card, see your invoices and cancel. It asks for your e-mail and sends you a link to the portal." : "To change your card or cancel, reply to the welcome e-mail.";
  }

  /* ── guide ──────────────────────────────────────────────────────── */
  function abrirGuia(){ $("#guia").hidden = false; $("#guiaOk").focus(); }
  async function fecharGuia(tab){
    $("#guia").hidden = true;
    if(sub && !sub.guia_visto){ sub.guia_visto = true; await sb.from("subscritores").update({ guia_visto: true }).eq("user_id", user.id); }
    if(tab !== "prefs") mostrarDica();
    go(tab);
  }
  $("#guiaOk").addEventListener("click", () => fecharGuia("prefs"));
  $("#guiaSaltar").addEventListener("click", () => fecharGuia("hoje"));
  $("#guiaFechar").addEventListener("click", () => fecharGuia("hoje"));
  $("#btnGuia").addEventListener("click", abrirGuia);
  addEventListener("keydown", e => { if(e.key === "Escape" && !$("#guia").hidden) fecharGuia("hoje"); });
})();

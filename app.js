/* ProvenDrop · member area (app.html). Loaded as an external file so the page
   can carry a strict Content-Security-Policy (no inline scripts). Values come
   from config.js (public only); access is decided by the RLS policies. */
(function(){
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const url = v => /^https?:\/\//i.test(String(v||"")) ? String(v) : "";
  /* Markets strip (2026-11-08): eight markets, in this order. */
  const MARKETS = ["US","CA","GB","DE","DK","FR","IT","ES"];
  /* The eight markets plus the countries also tracked by the routine (NL/AT/CH/HU): always shown by name, never "No data". */
  const PAIS = {US:"United States",CA:"Canada",GB:"United Kingdom",DE:"Germany",DK:"Denmark",FR:"France",IT:"Italy",ES:"Spain",NL:"Netherlands",AT:"Austria",CH:"Switzerland",HU:"Hungary"};
  const EU = new Set(["IT","ES","FR","DE","DK","NL","AT","HU"]);   /* countries covered by Meta's EU ad data (US/CA/GB/CH are not) */
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
  const MK_CURTO = { GB: "UK", US: "US", CA: "CA", CH: "CH" };
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
  /* A kit comes from the private bucket (zip_path, signed URL) or, for rows that only carry an external link
     (zip_url, e.g. the lists of 1 November 2026), from that link in a new tab (asked 2026-11-08; S7 accepted
     the trade-off). "Kit being prepared" only when there is neither. */
  const kitExterno = r => url(r.zip_url);
  const temKit = r => !!r.zip_path || !!kitExterno(r);
  /* The external link is a real <a> styled as the button (.dt a would recolour and underline it: overridden). */
  const botaoKit = (r, texto) => r.zip_path
    ? `<button class="btn btn-go btn-sm whitespace-normal text-left" type="button" data-zip="${esc(r.zip_path)}">${texto}</button>`
    : kitExterno(r) ? `<a class="btn btn-go btn-sm whitespace-normal text-left !text-white !no-underline" href="${esc(kitExterno(r))}" target="_blank" rel="noopener noreferrer" title="Opens the kit link in a new tab">${texto}</a>` : "";
  /* Days advertising: counted up to today when data_inicio exists; otherwise the value measured at analysis. */
  const diasAgora = r => { const d = parse(r.data_inicio); if(!d) return null; const n = Math.floor((Date.now() - d.getTime()) / 864e5); return n >= 0 ? n : null; };
  const dias = r => { const n = diasAgora(r); return n != null ? fmt(n) : `${fmt(r.dias_ativo)}<small class="at">at analysis</small>`; };

  /* Mirror of public.tem_acesso() (0009): not blocked, active or overdue for less than 7 days, and either a direct
     subscription or a Click one that Click has confirmed (estado_click = 'validado'; 'pendente'/'recusado' wait outside). */
  const diasAtraso = s => s?.em_atraso_desde ? Math.floor((Date.now() - new Date(s.em_atraso_desde).getTime()) / 864e5) : null;
  const ehClick = s => s?.origem === "click";
  const temAcesso = s => !!s && !s.bloqueado_em && (s.origem === "direto" || (ehClick(s) && s.estado_click === "validado")) && (s.estado === "ativo" || (s.estado === "em_atraso" && diasAtraso(s) != null && diasAtraso(s) < TOLERANCIA_DIAS));

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

  /* ── short links /c/<id> (R7) ───────────────────────────────────── */
  /* provendrop.com/c/<id> (WhatsApp message) → 404.html → app.html?c=<id>. The id (feed_dia.id_curto, six characters
     without 0/O/1/I) is read here once, kept in sessionStorage so it survives the sign-in round trip (and also goes
     into the magic-link redirect), and removed from the URL at once; abrirColecao() consumes it after the feed loads. */
  const C_RE = /^[A-HJ-NP-Z2-9]{6}$/, C_KEY = "pd_c";
  let cPedido = null;
  { const q = new URLSearchParams(location.search), c = String(q.get("c") || "").trim().toUpperCase();
    if(C_RE.test(c)){ cPedido = c; try { sessionStorage.setItem(C_KEY, c); } catch { /* private mode */ } }
    else { try { const s = sessionStorage.getItem(C_KEY); if(C_RE.test(s || "")) cPedido = s; } catch { /* private mode */ } }
    if(q.has("c")){ q.delete("c"); const qs = q.toString(); history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } }
  const esquecerC = () => { cPedido = null; try { sessionStorage.removeItem(C_KEY); } catch { /* private mode */ } };

  /* ── session ────────────────────────────────────────────────────── */
  /* Sign-in links from our e-mails carry ?token_hash=…&type=magiclink: they are only
     consumed here, by verifyOtp, so an e-mail scanner that opens the URL does not burn them. */
  const LINK_GASTO = "This sign-in link has expired or was already used. Enter your e-mail to get a new one.";
  function linkGasto(){ show("vLogin"); msg($("#msgLogin"), LINK_GASTO, "erro"); $("#email").focus(); }
  async function entrarPorTokenHash(){
    const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ""));
    /* A link already used or expired (Supabase redirects with ?error=access_denied&error_code=otp_expired, in the
       query or in the fragment): say so and offer a new one. The URL is cleaned either way. */
    if(/^(access_denied|otp_expired)$/.test(q.get("error") || q.get("error_code") || h.get("error") || h.get("error_code") || "")){ history.replaceState(null, "", location.pathname); linkGasto(); return false; }
    const th = q.get("token_hash"), tipo = q.get("type");
    if(!th) return false;
    history.replaceState(null, "", location.pathname);
    const { error } = await sb.auth.verifyOtp({ token_hash: th, type: tipo === "recovery" ? "recovery" : "magiclink" });
    if(error) linkGasto();
    return !error;
  }

  $("#formLogin").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#email").value.trim().toLowerCase(), m = $("#msgLogin"), b = $("#btnLogin");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg(m, "Enter a valid e-mail address.", "erro");
    b.disabled = true; msg(m, "Sending…");
    /* A pending /c/<id> rides along in the redirect so the magic link comes back to that collection. */
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname + (cPedido ? "?c=" + cPedido : ""), shouldCreateUser: false } });
    b.disabled = false;
    /* S11: neutral answer, whether or not the e-mail has an account. */
    if(error && !/signup|not allowed|not found|user/i.test(error.message)) return msg(m, "The link could not be sent right now. Please try again in a minute.", "erro");
    msg(m, "If this e-mail has a ProvenDrop subscription, a sign-in link is on its way. Open it on this device. Check the spam folder too.");
  });
  $("#btnSair").addEventListener("click", async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); });

  /* Both paths may fire for the same session (INITIAL_SESSION and getSession); the area is entered once per user
     (2026-11-09: a second entrar() re-rendered the tables and lost the /c/<id> highlight). */
  const mesmoUser = session => !!session?.user?.id && session.user.id === user?.id;
  sb.auth.onAuthStateChange((_ev, session) => { if(session?.user?.id !== user?.id) entrar(session); });
  entrarPorTokenHash().then(ok => { if(!ok) sb.auth.getSession().then(({ data }) => { if(!mesmoUser(data.session)) entrar(data.session); }); });

  const CAMPOS = "email,origem,estado,estado_click,nichos,paises,guia_visto,criado_em,em_atraso_desde,acesso_fim,bloqueado_em,boas_vindas_em";
  async function entrar(session){
    user = session?.user || null;
    if(!user){ sub = null; $("#who").hidden = true; show("vLogin"); return; }
    $("#whoEmail").textContent = user.email || ""; $("#who").hidden = false;
    const { data, error } = await sb.from("subscritores").select(CAMPOS).eq("user_id", user.id).maybeSingle();
    sub = error ? null : data;
    if(!temAcesso(sub)) return semAcesso();
    show("vApp");
    renderPlano(); renderConta(); renderPrefsForm(); renderBarras(); renderAvisos(); renderCaixaClick();
    /* Someone arriving from a /c/<id> link came for that collection: the guide waits for a normal visit. */
    if(!sub.guia_visto && !cPedido) abrirGuia(); else mostrarDica();
    carregarHoje().then(ok => { if(ok) abrirColecao(); });
  }

  function semAcesso(){
    const t = $("#semTitulo"), p = $("#semTexto"), g = $("#semPortal"), r = $("#semRegresso"), s = $("#semSubscrever"), pl = $("#semPlataforma");
    r.hidden = true; s.hidden = false; pl.hidden = true;
    let portal = !!PORTAL && !!sub;
    if(!sub){ t.textContent = "No active subscription"; p.textContent = "This e-mail has an account but is not linked to an active ProvenDrop subscription. If you have just paid, wait a minute and reload the page."; }
    else if(sub.bloqueado_em){ t.textContent = "Access suspended"; p.textContent = "Your access was suspended because of a payment dispute. Reply to any ProvenDrop e-mail and we sort it out with you."; s.hidden = true; }
    /* Click plan (0009): Click still has to confirm the person is a client; a refusal was refunded and cancelled by us. */
    else if(ehClick(sub) && sub.estado_click === "recusado"){ t.textContent = "Your Click plan was not confirmed"; p.textContent = "Click could not confirm you as a client, so your payment was refunded in full and the subscription cancelled. You can still join ProvenDrop directly."; s.hidden = true; pl.hidden = false; portal = false; }
    else if(ehClick(sub) && sub.estado_click === "pendente" && (sub.estado === "ativo" || sub.estado === "em_atraso")){ t.textContent = "Your Click access is being confirmed"; p.textContent = "Usually the same day. You'll get an e-mail as soon as Click confirms you're a client."; s.hidden = true; }
    else if(sub.estado === "incompleto"){ t.textContent = "Payment not completed"; p.textContent = "Your payment was started but not completed (for example, the bank confirmation was not finished). Nothing was charged yet. Subscribe again to complete it."; }
    else if(sub.estado === "em_atraso"){ t.textContent = "Payment overdue"; p.textContent = "The last payment failed and the " + TOLERANCIA_DIAS + "-day grace period is over. Update your card in “Manage subscription” and your access comes back as soon as the payment goes through."; }
    else if(sub.estado === "cancelado"){ t.textContent = "Subscription cancelled"; const volta = !!(LINK_RETURN && sub.boas_vindas_em); p.textContent = volta ? "Your subscription was cancelled. You can come back whenever you want: as a former member you only pay the monthly fee, not the joining fee again." : "Your subscription was cancelled. You can subscribe again whenever you want."; if(volta){ r.href = LINK_RETURN; r.hidden = false; s.hidden = true; } }
    else { t.textContent = "No access to the member area"; p.textContent = "This account is not linked to an active ProvenDrop subscription right now. If you have just paid, wait a minute and reload the page."; }
    g.hidden = !portal; if(PORTAL) g.href = PORTAL;
    show("vSemAcesso");
  }

  /* Which plan this member is on (design §5): under the Today title and in Subscription. */
  const PLANO = { click: "Plan: ProvenDrop × Click — member area + daily list in the Click WhatsApp group", direto: "Plan: ProvenDrop Platform — member area + daily e-mail" };
  const planoTexto = () => ehClick(sub) ? PLANO.click : PLANO.direto;
  function renderPlano(){ $("#plano").textContent = planoTexto(); }

  /* First visit of a Click member: a closable box saying the area has everything the WhatsApp group has, and more.
     Closing it is remembered in this browser only (localStorage, like the niches tip). */
  const CAIXA_CLICK_KEY = "pd_caixa_click_fechada";
  const caixaClickFechada = () => { try { return localStorage.getItem(CAIXA_CLICK_KEY) === "1"; } catch { return false; } };
  function renderCaixaClick(){ $("#caixaClick").hidden = !ehClick(sub) || caixaClickFechada(); }
  $("#caixaClickFechar").addEventListener("click", () => { try { localStorage.setItem(CAIXA_CLICK_KEY, "1"); } catch { /* private mode */ } $("#caixaClick").hidden = true; });

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
  /* Resolves true when the feed was loaded (even if empty), false when the query failed. */
  async function carregarHoje(){
    const feed = $("#feed");
    feed.innerHTML = '<div class="empty">Loading…</div>';
    /* One query serves the latest list, "Earlier this week" and the Library: every sending, newest first
       (PostgREST returns at most 1000 rows, i.e. the most recent ones; enough for many months of lists). */
    const { data, error } = await sb.from("feed_dia").select("*").order("dia", { ascending: false }).order("ordem");
    if(error){ feed.innerHTML = '<div class="empty">The collections could not be loaded right now.</div>'; return false; }
    feedTodos = data || [];
    retiradas = new Set(); { const vistas = new Set(); for(const r of feedTodos){ const k = chave(r); if(vistas.has(k)) continue; vistas.add(k); if(r.retirada === true) retiradas.add(k); } }
    if(!feedTodos.length){ feed.innerHTML = '<div class="empty">No collections published yet. ' + (HORA ? "They arrive every day at " + esc(HORA) + "." : "") + '</div>'; return true; }
    const d = feedTodos[0].dia;
    feedRows = feedTodos.filter(r => r.dia === d && visivel(r));
    const hoje = new Date().toISOString().slice(0,10);
    $("#hojeTitulo").textContent = d === hoje ? "Today’s collections" : "Collections for " + dia(d);
    $("#hojeSub").textContent = d === hoje ? dia(d) : "There is no list for today yet; this is the most recent one.";
    $("#hojeHora").textContent = HORA ? "New collections every day at " + HORA : "";
    renderFeed(); renderSemana(d);
    if(verdes) renderArquivo();
    return true;
  }

  /* Row attribute for /c/<id>: lets abrirColecao() find the row of a collection in any of the three tables. */
  const attrC = r => C_RE.test(String(r.id_curto || "")) ? ` data-c="${esc(r.id_curto)}"` : "";
  /* Opens the collection a /c/<id> link asked for (R7), once the feed is in: the newest sending with that id_curto
     that is still visible (not withdrawn). Today when it sits in the day's list or in "Earlier this week", else the
     Library ("Show all" is ticked if the niche filter would hide it). Unknown id or withdrawn only → Library with a
     notice. The id is forgotten either way. */
  async function abrirColecao(){
    const c = cPedido; if(!c) return; esquecerC();
    const linha = feedTodos.find(r => String(r.id_curto || "").toUpperCase() === c && visivel(r));
    const sel = `tr[data-c="${c}"]`;
    if(!linha){ go("arquivo"); msg($("#msgArquivo"), "This collection is no longer available."); return; }
    let tr = $("#tHoje " + sel);
    if(tr) go("hoje");
    else {
      go("arquivo");
      if(!verdes) await carregarArquivo();
      tr = $("#arqBox " + sel);
      if(!tr && !$("#fTodosWrap").hidden && !$("#fTodos").checked){ $("#fTodos").checked = true; renderArquivo(); tr = $("#arqBox " + sel); }
      if(!tr) return;
    }
    tr.classList.add("hit");
    requestAnimationFrame(() => tr.scrollIntoView({ block: "center", behavior: "instant" }));
  }

  /* Preferred niches first (the stored countries are no longer used to order or filter anything, 2026-11-08). */
  const porPreferencia = rows => { const pref = new Set((sub?.nichos||[]).map(s => s.toLowerCase())); return rows.slice().sort((a,b) => (pref.has(String(b.nicho||"").toLowerCase()) - pref.has(String(a.nicho||"").toLowerCase())) || (a.ordem - b.ordem)); };
  /* High-density table (one row per collection) inside the dark panel; stacked key/value blocks under 768px (.dt). */
  /* Meta and Google ads share one "Ads" column (two lines) so the row still fits at 1280 with real data
     (seven-cell market strip, "Advertiser: …"), 2026-11-08. */
  const tabela = (rows, opts) => `<table class="dt dt-dark"><thead><tr><th>Status</th><th>Collection · kit</th><th>Niche · market</th><th class="text-right" title="Active ads: Meta and Google">Ads</th><th class="text-right" title="Days advertising">Days</th><th class="text-right" title="Meta reach">Reach</th><th>Markets</th><th class="text-right">Score</th></tr></thead><tbody>${rows.map(r => cartao(r, opts)).join("")}</tbody></table>`;

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

  /* Eight-market strip; a strongest market outside the eight (NL/AT/CH/HU) is added as a ninth cell so it is never lost. */
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
    const kit = temKit(r) ? botaoKit(r, `Download Launch Kit${ok ? "" : " (under observation)"}`)
                          : `<span class="nota text-[12px] font-medium text-white/50">Kit being prepared</span>`;
    const adv = Number(googleAds(r)) > 0 && r.anunciante_google ? `<span class="adv sub mt-1 !text-white/80">Advertiser: ${esc(r.anunciante_google)}</span>` : "";
    return `<tr class="${pref ? "pref-first" : ""}"${attrC(r)}>
      <td data-l="Status"><span class="status ${ok ? "go" : "watch"}">${ok ? "Approved" : "Under observation"}</span>${ok ? "" : `<span class="obs mt-2 block max-w-[20ch] text-[12px] font-medium leading-snug text-amber-200/90">Under observation — test with a small budget</span>`}${opts?.dia ? `<span class="sub mt-2">Sent ${esc(diaMes(r.dia))}</span>` : ""}${chips(r, "mt-2")}</td>
      <td data-l="Collection"><div class="min-w-[160px] max-w-[220px]"><h3 class="text-[16px] font-bold leading-snug text-white">${esc(r.colecao || "Collection")}</h3><p class="shop mt-1 break-all text-[12px]">${lk ? `<a href="${esc(lk.href)}" target="_blank" rel="noopener">${esc(lk.texto)}</a>` : `<span class="text-white/50">${esc(r.loja || "")}</span>`}</p>${an ? `<p class="sub mt-1.5">Analysed ${esc(an)}</p>` : ""}<div class="mt-2.5">${kit}</div></div></td>
      <td data-l="Niche"><div class="min-w-[112px]"><b class="font-semibold text-white">${esc(nicho(r.nicho))}</b>${mk ? `<span class="sub">strongest in ${esc(pais(mk))}</span>` : ""}${adv}</div></td>
      <td class="n md:text-right" data-l="Ads"><span class="block whitespace-nowrap"><span class="block">${fmt(metaAds(r))} <span class="text-[12px] font-medium text-white/60">Meta</span></span><span class="block">${fmt(googleAds(r))} <span class="text-[12px] font-medium text-white/60">Google</span></span></span></td>
      <td class="n md:text-right" data-l="Days">${dias(r)}</td>
      <td class="n md:text-right" data-l="Meta reach">${reach(r)}</td>
      <td data-l="Markets"><div class="min-w-[120px]">${strip(mk, r.mercados_verdes)}<span class="sub mt-1.5">${r.trends_validados != null ? `Demand: ${esc(r.trends_validados)} of 6 markets` : "Demand: no data"}</span></div></td>
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
  /* One load at a time (go("arquivo") and abrirColecao() may both ask for it); a failed load can be retried. */
  let arquivoACarregar = null;
  function carregarArquivo(){
    if(arquivoACarregar) return arquivoACarregar;
    arquivoACarregar = (async () => {
      const box = $("#arqBox"); box.innerHTML = '<div class="empty">Loading…</div>';
      const { data, error } = await sb.from("verdes").select("*").order("data_aprovacao", { ascending: false });
      if(error){ box.innerHTML = '<div class="empty">The library could not be loaded right now.</div>'; return; }
      verdes = data || [];
      const rows = biblioteca();
      const nichos = [...new Set(rows.map(r => r.nicho).filter(Boolean))], paises = [...new Set(rows.map(r => String(r.mercado_destaque||"").toUpperCase()).filter(Boolean))].sort();
      $("#fNicho").innerHTML = '<option value="">All</option>' + nichos.map(n => `<option value="${esc(n)}">${esc(nicho(n))}</option>`).join("");
      $("#fPais").innerHTML = '<option value="">All</option>' + paises.map(p => `<option value="${esc(p)}">${esc(pais(p))}</option>`).join("");
      renderArquivo();
    })().finally(() => { arquivoACarregar = null; });
    return arquivoACarregar;
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
      if(f) Object.assign(f, { estado: "aprovada", data_aprovacao: v.data_aprovacao, ainda_a_anunciar: v.ainda_a_anunciar, anuncios_ultima_verificacao: v.anuncios_ultima_verificacao, ultima_verificacao: v.ultima_verificacao, scores_mercado: v.scores_mercado ?? f.scores_mercado, zip_path: f.zip_path || v.zip_path || null, zip_url: f.zip_url || v.zip_url || null });
      else porChave.set(k, Object.assign({}, v, { estado: v.estado || "aprovada", enviado_em: v.data_aprovacao }));
    }
    return [...porChave.values()].sort((a, b) => ((b.ainda_a_anunciar === true) - (a.ainda_a_anunciar === true)) || ((Number(b.score) || 0) - (Number(a.score) || 0)) || String(b.enviado_em||"").localeCompare(String(a.enviado_em||"")));
  }
  ["#fNicho","#fPais","#fPlat","#fAtivas","#fTodos"].forEach(s => $(s).addEventListener("change", renderArquivo));
  /* Library and your niches (2026-11-08): with niches chosen, only those are listed until "Show all" is ticked; with
     "Show all" (or no niches) every collection is listed, yours first. */
  const prefNichos = () => new Set((sub?.nichos||[]).map(s => s.toLowerCase()));
  const ehPref = r => prefNichos().has(String(r.nicho||"").toLowerCase());
  /* Platform filter: "meta" / "google" = advertises there (alone or with the other); "both" = on both.
     plats() reads plataformas / anuncios_meta / anuncios_google, so a Google-only store is never shown as Meta. */
  const plataformaOk = (r, pl) => !pl || (pl === "both" ? plats(r).length === 2 : plats(r).includes(pl));
  function renderArquivo(){
    const n = $("#fNicho").value, p = $("#fPais").value, pl = $("#fPlat").value, so = $("#fAtivas").checked;
    const temPref = prefNichos().size > 0, todos = !temPref || $("#fTodos").checked;
    $("#fTodosWrap").hidden = !temPref;
    const rows = biblioteca().filter(r => (todos || ehPref(r)) && (!n || r.nicho === n) && (!p || String(r.mercado_destaque||"").toUpperCase() === p) && plataformaOk(r, pl) && (!so || r.ainda_a_anunciar === true))
      .sort((a, b) => ehPref(b) - ehPref(a));   /* stable: keeps "still advertising, then score" inside each group */
    if(!rows.length){ $("#arqBox").innerHTML = `<div class="empty" style="border:0">${temPref && !todos ? "No collections in your niches match these filters. Tick “Show all” to see the other niches." : "No collections match these filters."}</div>`; return; }
    /* Same shape as the daily table so the whole row fits at 1280 without horizontal scroll (2026-11-08): the kit
       under the collection name, platform chips and "still advertising" under the status, market under the niche. */
    $("#arqBox").innerHTML = `<table class="dt"><thead><tr><th>Sent</th><th>Status</th><th>Collection · kit</th><th>Niche · market</th><th class="text-right">Score</th><th class="text-right" title="Active ads when sent, on Google, at the last check">Ads</th><th class="text-right" title="Meta reach">Reach</th><th class="text-right" title="Days advertising">Days</th></tr></thead><tbody>${rows.map(r => {
      const ok = aprovada(r), lk = ligacao(r), an = analisado(r), mk = String(r.mercado_destaque||"").toUpperCase(), sc = scoreMercado(r);
      const kit = temKit(r) ? botaoKit(r, "Download Launch Kit") : `<span class="sub">No kit for this one</span>`;
      const ainda = r.ainda_a_anunciar === true ? `<span class="sub mt-2 font-semibold !text-ok">Still advertising</span>` : r.ainda_a_anunciar === false ? `<span class="sub mt-2">No longer advertising</span>` : "";
      return `<tr${attrC(r)}>
        <td class="n whitespace-nowrap" data-l="Sent"><span>${esc(diaCurto(r.enviado_em) || "—")}${r.data_aprovacao && r.data_aprovacao !== r.enviado_em ? `<span class="sub">approved ${esc(diaMes(r.data_aprovacao))}</span>` : ""}</span></td>
        <td data-l="Status"><span class="block min-w-[140px]"><span class="status ${ok ? "go" : "watch"}">${ok ? "Approved" : "Under observation"}</span>${ainda}${chips(r, "mt-2")}</span></td>
        <td data-l="Collection"><span class="block min-w-[160px] max-w-[240px]">${lk ? `<a class="text-[15px] font-bold leading-snug no-underline hover:underline" href="${esc(lk.href)}" target="_blank" rel="noopener">${esc(r.colecao)}</a>` : `<span class="text-[15px] font-bold leading-snug text-ink">${esc(r.colecao)}</span>`}${lk ? `<a class="sub break-all font-medium no-underline hover:underline" href="${esc(lk.href)}" target="_blank" rel="noopener">${esc(lk.texto)}</a>` : `<span class="sub">${esc(r.loja||"")}</span>`}${an ? `<span class="sub">Analysed ${esc(an)}</span>` : ""}<span class="mt-2.5 block">${kit}</span></span></td>
        <td data-l="Niche"><span class="block min-w-[112px]"><b class="font-semibold">${esc(nicho(r.nicho))}</b>${mk ? `<span class="sub">strongest in ${esc(pais(mk))}</span>` : ""}</span></td>
        <td class="n md:text-right" data-l="Score"><span class="whitespace-nowrap"><b class="font-extrabold">${score(r.score)}</b>${sc.mk ? `<span class="sub" title="${sc.proprio ? "Score for" : "Approved for"} ${esc(pais(sc.mk))}, the strongest market">${sc.proprio ? `${sc.valor} in ${esc(sc.mk)}` : `for ${esc(sc.mk)}`}</span>` : ""}</span></td>
        <td class="n md:text-right" data-l="Ads"><span><span class="whitespace-nowrap">${fmt(r.anuncios_ativos)} when sent</span>${Number(googleAds(r)) > 0 ? `<span class="sub">${fmt(googleAds(r))} on Google</span>` : ""}${r.anuncios_ultima_verificacao != null ? `<span class="sub whitespace-nowrap">${fmt(r.anuncios_ultima_verificacao)} on ${esc(diaMes(r.ultima_verificacao) || "—")}</span>` : ""}</span></td>
        <td class="n md:text-right" data-l="Meta reach"><span>${reach(r)}</span></td>
        <td class="n md:text-right" data-l="Days advertising"><span>${dias(r)}</span></td>
      </tr>`; }).join("")}</tbody></table>`;
  }

  /* ── preferences ────────────────────────────────────────────────── */
  /* Niches only, and optional (2026-11-08). "Countries you sell in" was removed: subscritores.paises stays in the
     database untouched but is neither shown nor used. */
  function renderPrefsForm(){
    const n = new Set(sub?.nichos||[]);
    $("#prefNichos").innerHTML = NICHOS.map(([v,l]) => `<label class="check"><input type="checkbox" name="nicho" value="${esc(v)}"${n.has(v) ? " checked" : ""}> ${esc(l)}</label>`).join("");
  }
  /* Saves the niches (from the Preferences tab or from a bar) and refreshes everything that depends on them. */
  async function guardarNichos(nichos){
    const { error } = await sb.from("subscritores").update({ nichos }).eq("user_id", user.id);
    if(error) return false;
    sub.nichos = nichos; mostrarDica(); renderPrefsForm(); renderBarras();
    renderFeed(); if(feedRows.length) renderSemana(feedRows[0].dia); if(verdes) renderArquivo();
    return true;
  }
  $("#formPrefs").addEventListener("submit", async e => {
    e.preventDefault();
    const nichos = [...$("#formPrefs").querySelectorAll('input[name="nicho"]:checked')].map(i => i.value);
    if(!await guardarNichos(nichos)) return msg($("#msgPrefs"), "The preferences could not be saved right now.", "erro");
    msg($("#msgPrefs"), "Preferences saved.");
  });
  /* Niches bar on Today and Library (2026-11-08): "Your niches: … · Edit"; Edit opens the same choice right there. */
  function renderBarras(){
    const n = sub?.nichos||[];
    const lista = n.length ? `<b class="text-ink">${esc(n.map(nicho).join(", "))}</b>` : `<span class="text-ink-3">none chosen — all collections, in the list’s order</span>`;
    document.querySelectorAll("[data-barra]").forEach(box => {
      box.innerHTML = `<div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px] text-ink-2"><span class="font-semibold">Your niches:</span> ${lista}<button class="btn btn-line btn-sm ml-auto" type="button" data-pref-edit>Edit</button></div>
        <form class="card mt-2 p-4 md:p-5" data-pref-form hidden><p class="text-[13px] font-bold text-ink">Your niches (optional) — these come first; the others stay visible.</p><div class="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">${NICHOS.map(([v,l]) => `<label class="check"><input type="checkbox" name="nicho" value="${esc(v)}"${n.includes(v) ? " checked" : ""}> ${esc(l)}</label>`).join("")}</div><div class="mt-4 flex flex-wrap gap-2"><button class="btn btn-go btn-sm" type="submit">Save</button><button class="btn btn-line btn-sm" type="button" data-pref-cancel>Cancel</button></div><div class="msg" data-pref-msg hidden></div></form>`;
    });
  }
  document.addEventListener("click", e => {
    const ed = e.target.closest("[data-pref-edit]"), ca = e.target.closest("[data-pref-cancel]");
    if(ed){ const f = ed.closest("[data-barra]").querySelector("[data-pref-form]"); f.hidden = !f.hidden; if(!f.hidden) f.querySelector("input")?.focus(); }
    if(ca){ renderBarras(); }
  });
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-pref-form]"); if(!f) return;
    e.preventDefault();
    const nichos = [...f.querySelectorAll('input[name="nicho"]:checked')].map(i => i.value);
    if(!await guardarNichos(nichos)){ const m = f.querySelector("[data-pref-msg]"); msg(m, "The preferences could not be saved right now.", "erro"); }
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
    $("#contaPlano").textContent = planoTexto();
    $("#contaNota").textContent = PORTAL ? "In “Manage subscription” you change your card, see your invoices and cancel. It asks for your e-mail and sends you a link to the portal." : "To change your card or cancel, reply to the welcome e-mail.";
    /* Click plan: the group is Click's; cancelling here ends both. */
    $("#contaClick").hidden = !ehClick(sub);
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

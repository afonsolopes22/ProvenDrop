/* ProvenDrop · administrator page (admin.html): Click purchases. Since 2026-11-13 new purchases get access
   straight away (validated automatically by the webhook); this page lists them for review ("Validated
   automatically in the last 7 days", Reject & refund) and keeps the old list of purchases waiting for validation.
   Loaded as an external file so the page can carry a strict Content-Security-Policy
   (no inline scripts). Values come from config.js (public only). Every action goes
   through the admin-click Edge Function with the user's JWT; the function decides who
   is the administrator (ADMIN_EMAIL secret) and answers 403 to anyone else. */
(function(){
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const C = window.PROVENDROP_CONFIG || {};

  const views = ["vConfig","vLogin","vAdmin"];
  function show(id){ views.forEach(v => { $("#"+v).hidden = v !== id; }); }
  function msg(el, texto, tipo){ el.textContent = texto; el.className = "msg" + (tipo ? " "+tipo : ""); el.hidden = !texto; }

  const SB_URL = String(C.SUPABASE_URL||"").trim(), SB_KEY = String(C.SUPABASE_ANON_KEY||"").trim();
  if(!/^https:\/\//.test(SB_URL) || !SB_KEY || !window.supabase){ show("vConfig"); return; }
  /* S12: PKCE instead of implicit (no tokens in the URL fragment). */
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true } });
  const FN_URL = SB_URL.replace(/\/+$/, "") + "/functions/v1/admin-click";

  /* Texts shown to the administrator (English only). */
  const SO_ADMIN = "This page is only for the ProvenDrop administrator.";
  const VAZIO = "No Click purchases waiting for validation.";
  const ERRO = "Something went wrong. Try again in a minute.";
  const NAO_PENDENTE = "This purchase can no longer be changed here: it was already rejected, or validated by hand.";
  const AUTO_VAZIO = "No purchases validated automatically in the last 7 days.";
  const AUTO_INDISPONIVEL = "This list needs the updated admin function (admin-click). It appears once it is deployed.";
  const STRIPE_FALHOU = "Marked as rejected, but Stripe did not finish the refund or the cancellation. Finish it in the Stripe dashboard; an alert was e-mailed to you.";

  /* ── ?compra=PD-XXXXXX (link in the alert e-mail) ──────────────────── */
  /* Shows only that purchase. It survives the magic-link round trip (sessionStorage and the redirect URL), like
     ?c= in app.js. Opening the link never rejects anything: only the in-row confirmation does. */
  const COMPRA_RE = /^PD-[A-HJ-NP-Z2-9]{6}$/, COMPRA_KEY = "pd_admin_compra";
  let compra = null;
  { const q = new URLSearchParams(location.search), c = String(q.get("compra") || "").trim().toUpperCase();
    if(COMPRA_RE.test(c)){ compra = c; try { sessionStorage.setItem(COMPRA_KEY, c); } catch { /* private mode */ } }
    else { try { const v = sessionStorage.getItem(COMPRA_KEY); if(COMPRA_RE.test(v || "")) compra = v; } catch { /* private mode */ } }
    if(q.has("compra")){ q.delete("compra"); const qs = q.toString(); history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } }
  function semFiltro(){ compra = null; try { sessionStorage.removeItem(COMPRA_KEY); } catch { /* private mode */ } render(); }

  /* ── session (same flow as app.js) ─────────────────────────────────── */
  /* Sign-in links from our e-mails carry ?token_hash=…&type=magiclink: they are only
     consumed here, by verifyOtp, so an e-mail scanner that opens the URL does not burn them. */
  const LINK_GASTO = "This sign-in link has expired or was already used. Enter your e-mail to get a new one.";
  function linkGasto(){ show("vLogin"); msg($("#msgLogin"), LINK_GASTO, "erro"); $("#email").focus(); }
  async function entrarPorTokenHash(){
    const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ""));
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
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname + (compra ? "?compra=" + compra : ""), shouldCreateUser: false } });
    b.disabled = false;
    /* S11: neutral answer, whether or not the e-mail has an account. */
    if(error && !/signup|not allowed|not found|user/i.test(error.message)) return msg(m, "The link could not be sent right now. Please try again in a minute.", "erro");
    msg(m, "If this e-mail has a ProvenDrop account, a sign-in link is on its way. Open it on this device. Check the spam folder too.");
  });
  $("#btnSair").addEventListener("click", async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); });

  let user = null, pendentes = [], autos = null, confirmando = null; /* autos: null = list not available; confirmando: e-mail of the row showing the confirm step */
  let sessaoVista; /* user id of the last session handled (null = signed out); undefined = nothing handled yet */

  sb.auth.onAuthStateChange((_ev, session) => { entrar(session); });
  entrarPorTokenHash().then(ok => { if(!ok) sb.auth.getSession().then(({ data }) => entrar(data.session)); });

  /* Idempotent: the auth listener and the explicit getSession() may both report the same session. */
  async function entrar(session){
    const id = session?.user?.id || null;
    if(sessaoVista !== undefined && id === sessaoVista) return;
    sessaoVista = id;
    user = session?.user || null;
    if(!user){ $("#who").hidden = true; show("vLogin"); return; }
    $("#whoEmail").textContent = user.email || ""; $("#who").hidden = false;
    show("vAdmin");
    await carregar();
  }

  /* ── Edge Function ──────────────────────────────────────────────────── */
  /* One POST to admin-click with the user's JWT. Resolves to { status, body }; never throws. */
  async function chamar(corpo){
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    if(!token) return { status: 401, body: {} };
    try {
      const r = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token, "apikey": SB_KEY },
        body: JSON.stringify(corpo),
      });
      const body = await r.json().catch(() => ({}));
      return { status: r.status, body };
    } catch { return { status: 0, body: {} }; }
  }

  async function carregar(){
    const m = $("#msgAdmin"), box = $("#lista");
    box.innerHTML = '<div class="empty">Loading…</div>'; $("#listaAuto").innerHTML = '<div class="empty">Loading…</div>';
    const [r, ra] = await Promise.all([chamar({ acao: "listar" }), chamar({ acao: "listar_auto" })]);
    if(r.status === 401){ await sb.auth.signOut(); location.reload(); return; }
    if(r.status === 403){ box.innerHTML = ""; $("#listaAuto").innerHTML = ""; $("#adminCount").textContent = ""; $("#btnRefresh").hidden = true; msg(m, SO_ADMIN, "erro"); return; }
    if(r.status !== 200 || !Array.isArray(r.body)){ box.innerHTML = ""; msg(m, ERRO, "erro"); return; }
    pendentes = r.body;
    /* An admin-click deployed before 2026-11-13 answers 400 to "listar_auto": show a note, not an error. */
    autos = ra.status === 200 && Array.isArray(ra.body) ? ra.body : null;
    confirmando = null;
    render();
  }

  /* ── table ──────────────────────────────────────────────────────────── */
  const txt = v => v == null || v === "" ? "—" : String(v);
  const data = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"; };

  const filtrar = rows => compra ? rows.filter(p => String(p.codigo_compra || "").toUpperCase() === compra) : rows;
  const CABECALHO = (ultima, data) => `<table class="dt"><thead><tr><th>Name</th><th>Store</th><th>Phone</th><th>E-mail</th><th>Code</th><th>${data}</th><th>${ultima}</th></tr></thead><tbody>`;

  function render(){
    const box = $("#lista"), boxA = $("#listaAuto"), f = $("#filtro");
    const pend = filtrar(pendentes), aut = autos ? filtrar(autos) : null;
    $("#adminCount").textContent = pendentes.length ? pendentes.length + " waiting" : "";
    if(compra){
      const achou = pend.length + (aut ? aut.length : 0);
      f.innerHTML = `${achou ? "Showing purchase" : "No purchase found with code"} <b>${esc(compra)}</b> only. <button class="btn btn-line btn-sm ml-2" type="button" id="btnTodos">Show all</button>`;
      f.className = "msg"; f.hidden = false;
      $("#btnTodos").addEventListener("click", semFiltro);
    } else { f.hidden = true; f.innerHTML = ""; }
    box.innerHTML = pend.length ? CABECALHO("Actions", "Paid on") + pend.map(p => linha(p, "pendente")).join("") + "</tbody></table>" : `<div class="empty">${VAZIO}</div>`;
    if(aut === null){ boxA.innerHTML = `<div class="empty">${AUTO_INDISPONIVEL}</div>`; return; }
    boxA.innerHTML = aut.length ? CABECALHO("Status", "Validated on") + aut.map(p => linha(p, "auto")).join("") + "</tbody></table>" : `<div class="empty">${AUTO_VAZIO}</div>`;
  }

  /* One row. "Reject & refund" first swaps the two buttons for an in-row confirmation
     (no window.confirm): "Confirm refund and cancel" does the call, "Keep pending" goes back. */
  function linha(p, modo){
    const e = esc(p.email);
    const recusado = modo === "auto" && p.estado_click === "recusado";
    const acoes = recusado ? `<span class="status watch">Rejected</span>`
      : confirmando === p.email
      ? `<div class="grid gap-2"><span class="text-[13px] font-semibold text-bad">Refund in full and cancel the subscription?</span><div class="flex flex-wrap gap-2"><button class="btn btn-line btn-sm !border-bad !text-bad" type="button" data-act="confirmar" data-email="${e}">Confirm refund and cancel</button><button class="btn btn-line btn-sm" type="button" data-act="voltar" data-email="${e}">Keep pending</button></div></div>`
      : modo === "auto" ? `<div class="flex flex-wrap items-center gap-2"><span class="status go">Access active</span><button class="btn btn-line btn-sm" type="button" data-act="recusar" data-email="${e}">Reject &amp; refund</button></div>`
      : `<div class="flex flex-wrap gap-2"><button class="btn btn-go btn-sm" type="button" data-act="validar" data-email="${e}">Validate</button><button class="btn btn-line btn-sm" type="button" data-act="recusar" data-email="${e}">Reject &amp; refund</button></div>`;
    return `<tr data-email="${e}">` +
      `<td data-l="Name"><b>${esc(txt(p.nome))}</b></td>` +
      `<td data-l="Store">${esc(txt(p.loja))}</td>` +
      `<td data-l="Phone" class="n whitespace-nowrap">${esc(txt(p.telefone))}</td>` +
      `<td data-l="E-mail"><a href="mailto:${e}">${e}</a></td>` +
      `<td data-l="Code" class="n font-semibold whitespace-nowrap">${esc(txt(p.codigo_compra))}</td>` +
      `<td data-l="${modo === "auto" ? "Validated on" : "Paid on"}" class="n whitespace-nowrap">${esc(data(modo === "auto" ? p.validado_auto_em : p.criado_em))}</td>` +
      `<td data-l="${modo === "auto" ? "Status" : "Actions"}">${acoes}</td></tr>`;
  }

  async function aoClicar(e){
    const b = e.target.closest("button[data-act]"); if(!b) return;
    const email = b.dataset.email, act = b.dataset.act, m = $("#msgAdmin");
    if(act === "recusar"){ confirmando = email; render(); return; }
    if(act === "voltar"){ confirmando = null; render(); return; }
    /* validar / confirmar: disable the row's buttons while the call runs */
    b.closest("tr").querySelectorAll("button").forEach(x => { x.disabled = true; });
    b.textContent = "Working…";
    msg(m, "");
    const r = await chamar({ acao: act === "confirmar" ? "recusar" : "validar", email });
    if(r.status === 401){ await sb.auth.signOut(); location.reload(); return; }
    if(r.status === 403){ msg(m, SO_ADMIN, "erro"); }
    else if(r.status === 409){ msg(m, NAO_PENDENTE, "aviso"); }
    else if(r.status === 502 && act === "confirmar"){ msg(m, STRIPE_FALHOU, "erro"); }
    else if(r.status !== 200){ msg(m, ERRO, "erro"); }
    else if(act === "validar"){
      msg(m, r.body.boas_vindas === "enviadas"
        ? `Validated: ${email} now has access to the member area and received the sign-in e-mail.`
        : `Validated: ${email} now has access to the member area. The sign-in e-mail could not be sent yet; it will be retried automatically.`);
    } else {
      const parte = (r.body.reembolsado ? "was refunded in full" : "had nothing to refund (€0 invoice)") + (r.body.cancelada ? " and the subscription was cancelled" : "");
      msg(m, `Rejected: ${email} ${parte}. ${r.body.email_enviado ? "The customer was e-mailed." : "The e-mail to the customer could not be sent."}`);
    }
    await carregar();
  }
  $("#lista").addEventListener("click", aoClicar);
  $("#listaAuto").addEventListener("click", aoClicar);
  $("#btnRefresh").addEventListener("click", () => { msg($("#msgAdmin"), ""); carregar(); });
})();

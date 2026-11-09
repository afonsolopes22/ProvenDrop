/* ProvenDrop · administrator page (admin.html): Click purchases waiting for validation.
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
  const NAO_PENDENTE = "This purchase is no longer pending: it was already validated or rejected.";
  const STRIPE_FALHOU = "Marked as rejected, but Stripe did not finish the refund or the cancellation. Finish it in the Stripe dashboard; an alert was e-mailed to you.";

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
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
    b.disabled = false;
    /* S11: neutral answer, whether or not the e-mail has an account. */
    if(error && !/signup|not allowed|not found|user/i.test(error.message)) return msg(m, "The link could not be sent right now. Please try again in a minute.", "erro");
    msg(m, "If this e-mail has a ProvenDrop account, a sign-in link is on its way. Open it on this device. Check the spam folder too.");
  });
  $("#btnSair").addEventListener("click", async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); });

  let user = null, pendentes = [], confirmando = null; /* confirmando: e-mail of the row showing the confirm step */
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
    box.innerHTML = '<div class="empty">Loading…</div>';
    const r = await chamar({ acao: "listar" });
    if(r.status === 401){ await sb.auth.signOut(); location.reload(); return; }
    if(r.status === 403){ box.innerHTML = ""; $("#adminCount").textContent = ""; $("#btnRefresh").hidden = true; msg(m, SO_ADMIN, "erro"); return; }
    if(r.status !== 200 || !Array.isArray(r.body)){ box.innerHTML = ""; msg(m, ERRO, "erro"); return; }
    pendentes = r.body; confirmando = null;
    render();
  }

  /* ── table ──────────────────────────────────────────────────────────── */
  const txt = v => v == null || v === "" ? "—" : String(v);
  const data = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"; };

  function render(){
    const box = $("#lista");
    $("#adminCount").textContent = pendentes.length ? pendentes.length + (pendentes.length === 1 ? " pending" : " pending") : "";
    if(!pendentes.length){ box.innerHTML = `<div class="empty">${VAZIO}</div>`; return; }
    box.innerHTML = `<table class="dt"><thead><tr><th>Name</th><th>Store</th><th>Phone</th><th>E-mail</th><th>Code</th><th>Paid on</th><th>Actions</th></tr></thead><tbody>${pendentes.map(linha).join("")}</tbody></table>`;
  }

  /* One row. "Reject & refund" first swaps the two buttons for an in-row confirmation
     (no window.confirm): "Confirm refund and cancel" does the call, "Keep pending" goes back. */
  function linha(p){
    const e = esc(p.email);
    const acoes = confirmando === p.email
      ? `<div class="grid gap-2"><span class="text-[13px] font-semibold text-bad">Refund in full and cancel the subscription?</span><div class="flex flex-wrap gap-2"><button class="btn btn-line btn-sm !border-bad !text-bad" type="button" data-act="confirmar" data-email="${e}">Confirm refund and cancel</button><button class="btn btn-line btn-sm" type="button" data-act="voltar" data-email="${e}">Keep pending</button></div></div>`
      : `<div class="flex flex-wrap gap-2"><button class="btn btn-go btn-sm" type="button" data-act="validar" data-email="${e}">Validate</button><button class="btn btn-line btn-sm" type="button" data-act="recusar" data-email="${e}">Reject &amp; refund</button></div>`;
    return `<tr data-email="${e}">` +
      `<td data-l="Name"><b>${esc(txt(p.nome))}</b></td>` +
      `<td data-l="Store">${esc(txt(p.loja))}</td>` +
      `<td data-l="Phone" class="n whitespace-nowrap">${esc(txt(p.telefone))}</td>` +
      `<td data-l="E-mail"><a href="mailto:${e}">${e}</a></td>` +
      `<td data-l="Code" class="n font-semibold whitespace-nowrap">${esc(txt(p.codigo_compra))}</td>` +
      `<td data-l="Paid on" class="n whitespace-nowrap">${esc(data(p.criado_em))}</td>` +
      `<td data-l="Actions">${acoes}</td></tr>`;
  }

  $("#lista").addEventListener("click", async e => {
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
  });
  $("#btnRefresh").addEventListener("click", () => { msg($("#msgAdmin"), ""); carregar(); });
})();

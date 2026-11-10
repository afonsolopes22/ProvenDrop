/* ProvenDrop · site configuration (ONE place for every public value).
   Loaded by index.html, bem-vindo.html, bem-vindo-click.html and app.html.

   Only PUBLIC values live here. The Supabase anon key is public by design:
   access to data is decided by the RLS policies on the server.
   NEVER put here: Stripe secret keys, webhook secrets, Resend keys, the
   Supabase service role key or the CRON secret (those go to
   `supabase secrets set`, see docs/SETUP.md).

   Empty values are safe: the Subscribe button stays disabled ("enrolment
   not open yet"), the CTR block stays hidden, the time shows "[HOUR]". */
window.PROVENDROP_CONFIG = {
  /* Supabase project (Settings → API). */
  SUPABASE_URL: "https://maljrfgnnhtrjunnwlre.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hbGpyZmdubmh0cmp1bm53bHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1Njg4NTEsImV4cCI6MjEwOTE0NDg1MX0.wMbnDi7rG9nz4tVUYZ4Z_gEF28V3IJaSxnnjyydVzjU",

  /* Stripe Payment Link of the direct subscription (https://buy.stripe.com/…).
     LIVE link since 2026-11-06 (account activated; docs/STRIPE.md): monthly fee
     + joining fee, metadata origem=direto, redirects to bem-vindo.html after
     payment. Empty = Subscribe button disabled.
     Test links (test mode) go to config.local.js, loaded only on localhost.
     ACTIVE since 2026-11-10: the live webhook delivers and processes events
     (checked in stripe_eventos); the link requires accepting the Terms and
     accepts promotion codes (docs/STRIPE.md). */
  STRIPE_LINK_DIRECT: "https://buy.stripe.com/7sYaEYd3Rcmid5w6nA4gg00",

  /* Stripe Payment Link of the CLICK plan (monthly fee only, no joining fee;
     metadata origem=click; redirects to bem-vindo-click.html?session_id=…, where
     the WhatsApp button carries the purchase code). Shown on the site, to
     everyone, in the "ProvenDrop × Click" plan card and in the "Click Dynamics
     client?" box ("Subscribe — ProvenDrop × Click"). Empty = those buttons
     disabled, like Subscribe.
     ACTIVE since 2026-11-08 by decision of the Click plan
     (docs/superpowers/plans/2026-11-08-click-plan.md, task R6). */
  STRIPE_LINK_CLICK: "https://buy.stripe.com/9B6eVe5BpgCyfdEaDQ4gg01",

  /* Stripe Payment Link for RETURNING members (monthly fee only, no joining fee),
     shown in the member area to former members. No live link exists yet
     (docs/STRIPE.md, "Por fazer"): while empty, former members see the normal
     Subscribe button and the "monthly fee only" promise is not shown. */
    STRIPE_LINK_RETURN: "",

  /* Stripe customer portal login link (https://billing.stripe.com/p/login/…).
     LIVE link since 2026-11-06. Empty = "Manage subscription" buttons hidden
     (bem-vindo-click.html falls back to WhatsApp). */
  STRIPE_PORTAL_LINK: "https://billing.stripe.com/p/login/7sYaEYd3Rcmid5w6nA4gg00",

  /* Time the daily collections are delivered, Europe/Lisbon, "HH:MM".
     Must match the HORA_ENVIO secret of the email-diario function
     (scripts/setup-supabase.ps1 reads it from here). */
  DAILY_TIME: "09:00",

  /* Published price, in euros (digits only). Must match the Stripe prices.
     PRICE_JOINING "0" = no joining fee (the fee line disappears). */
  PRICE_MONTHLY: "15",
  PRICE_JOINING: "25",

  /* Optional public contact e-mail. Empty = not shown. */
  CONTACT_EMAIL: "",

  /* Observed Google Ads CTR of the kit prompts. Shown ONLY when all four
     fields come from documented campaign data (see README). */
  CTR: { valor: "", tipo_campanha: "", periodo: "", impressoes: "" }
};

/* S1: local tests only. When the page is served from localhost / 127.0.0.1 /
   [::1] (or *.localhost), config.local.js is loaded right after this file and
   overrides the Stripe links with TEST ones (file git-ignored; copy
   config.local.example.js). Any other host (GitHub Pages, provendrop.com) never
   requests it, so the published site always uses the live links written above.
   document.write is used on purpose: the load stays
   synchronous, so the pages' inline scripts and the deferred app.js all see the
   overrides. */
(function(){
  var h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || /\.localhost$/.test(h)) {
    document.write('<script src="config.local.js"><\/script>');
  }
})();

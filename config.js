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
     Redirects to bem-vindo.html after payment. Empty = button disabled.
     Decision S1 (2026-11-02): EMPTY on main until live mode, so the published
     site never opens a test Checkout. The TEST links live in config.local.js
     (git-ignored, loaded only on localhost; copy config.local.example.js).
     The live link goes here only with explicit approval (docs/STRIPE.md,
     "Modo real"). */
  STRIPE_LINK_DIRECT: "",

  /* Stripe Payment Link for RETURNING members (monthly fee only, no joining fee).
     Created by scripts/stripe-teste.ps1; shown in the member area to former members.
     Empty = the normal link is shown instead (nothing, when that one is empty too).
     Empty on main until live mode (S1); test URL in config.local.js. */
  STRIPE_LINK_RETURN: "",

  /* Stripe customer portal login link (https://billing.stripe.com/p/login/…).
     Empty = "Manage subscription" buttons hidden (bem-vindo-click.html falls back
     to WhatsApp). Empty on main until live mode (S1); test URL in config.local.js. */
  STRIPE_PORTAL_LINK: "",

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
   overrides the Stripe TEST links (file git-ignored; copy
   config.local.example.js). Any other host (GitHub Pages, provendrop.com) never
   requests it, so the published site keeps Subscribe disabled until the live
   links are written above. document.write is used on purpose: the load stays
   synchronous, so the pages' inline scripts and the deferred app.js all see the
   overrides. */
(function(){
  var h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || /\.localhost$/.test(h)) {
    document.write('<script src="config.local.js"><\/script>');
  }
})();

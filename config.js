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
     Must redirect to bem-vindo.html after payment. Empty = button disabled. */
  STRIPE_LINK_DIRECT: "",

  /* Stripe customer portal login link (https://billing.stripe.com/p/login/…).
     Empty = "Manage subscription" buttons hidden. */
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

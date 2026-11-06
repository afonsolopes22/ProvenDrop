/* ProvenDrop · LOCAL overrides for tests (decision S1, 2026-11-02).

   Copy this file to config.local.js (git-ignored) and serve the site from
   localhost, e.g.  python -m http.server 8000  in the repository root, then
   open http://localhost:8000/index.html. config.js loads config.local.js only
   when location.hostname is localhost / 127.0.0.1 / [::1]; GitHub Pages and
   provendrop.com never request it, so the published site always uses the LIVE
   links written in config.js (live since 2026-11-06).

   Only PUBLIC values here (Payment Link and portal URLs of the Stripe TEST
   mode, https://buy.stripe.com/test_… and https://billing.stripe.com/p/login/test_…).
   The test ids and URLs are in the vault note "Stripe — modo de teste (IDs e links)";
   they are not kept in the repository. Never keys. */
Object.assign(window.PROVENDROP_CONFIG, {
  /* Stripe TEST Payment Link Direct (monthly + joining fee). Empty = Subscribe disabled. */
  STRIPE_LINK_DIRECT: "",

  /* Stripe TEST Payment Link for returning members (monthly only): paste the
     URL printed by scripts/stripe-teste.ps1. Empty = the Direct link is used. */
  STRIPE_LINK_RETURN: "",

  /* Stripe TEST customer portal login link. Empty = "Manage subscription" hidden. */
  STRIPE_PORTAL_LINK: ""
});

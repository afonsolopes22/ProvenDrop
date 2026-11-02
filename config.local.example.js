/* ProvenDrop · LOCAL overrides for tests (decision S1, 2026-11-02).

   Copy this file to config.local.js (git-ignored) and serve the site from
   localhost, e.g.  python -m http.server 8000  in the repository root, then
   open http://localhost:8000/index.html. config.js loads config.local.js only
   when location.hostname is localhost / 127.0.0.1 / [::1]; GitHub Pages and
   provendrop.com never request it, so main keeps Subscribe disabled.

   Only PUBLIC values here (Payment Link and portal URLs). Never keys. */
Object.assign(window.PROVENDROP_CONFIG, {
  /* Stripe TEST Payment Link Direct (plink_1UX9UkJMAlqVy4dKAXTumtyZ). */
  STRIPE_LINK_DIRECT: "https://buy.stripe.com/test_cNidRaaV4gWv1Cy7mhfbq00",

  /* Stripe TEST Payment Link for returning members (monthly only): paste the
     URL printed by scripts/stripe-teste.ps1. Empty = the Direct link is used. */
  STRIPE_LINK_RETURN: "",

  /* Stripe TEST customer portal login link. */
  STRIPE_PORTAL_LINK: "https://billing.stripe.com/p/login/test_cNidRaaV4gWv1Cy7mhfbq00"
});

/* ProvenDrop · analytics (PostHog, EU cloud) — since 2026-11-13.
   Loaded right after config.js on the public pages and the member area (never on admin.html).
   Privacy: no cookies (persistence "memory"), person profiles only for signed-in members, identified by the
   Supabase user id (never the e-mail); session replay masks every input and the e-mail shown in the header.
   Events carry only the collection's id_curto, never store links or kit paths.
   Off on localhost and when POSTHOG_KEY is empty. Pages call window.pdTrack(event, props) and
   window.pdIdentify(id, props); both are no-ops when analytics is off. */
(function(){
  window.pdTrack = function(){}; window.pdIdentify = function(){};
  var C = window.PROVENDROP_CONFIG || {}, key = String(C.POSTHOG_KEY || "").trim();
  var host = String(C.POSTHOG_HOST || "https://eu.i.posthog.com").trim(), h = location.hostname;
  /* Internal devices (the owner's own browsers) are never counted: open any page once with ?pd_interno=1 to switch
     this browser off for good, ?pd_interno=0 to switch it back on. The flag lives only in this browser. */
  try {
    var q = new URLSearchParams(location.search).get("pd_interno");
    if (q === "1") localStorage.setItem("pd_interno", "1");
    if (q === "0") localStorage.removeItem("pd_interno");
    if (localStorage.getItem("pd_interno") === "1") return;
  } catch (e) { /* storage blocked: count normally */ }
  if (!key || h === "localhost" || h === "127.0.0.1" || h === "[::1]" || /\.localhost$/.test(h)) return;
  /* official PostHog loader stub (loads array.js from eu-assets.i.posthog.com) */
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  /* Stable id without cookies: a signed-in member is the Supabase user id (read from the session the member area
     keeps in localStorage), so identify() never merges a fresh random id; anonymous visitors get one id per page
     view, as "memory" persistence would mint anyway (bootstrapping it keeps PostHog from warning in the console). */
  var uid = "";
  try {
    var ref = String(C.SUPABASE_URL || "").replace(/^https:\/\//, "").split(".")[0];
    var s = ref && JSON.parse(localStorage.getItem("sb-" + ref + "-auth-token") || "null");
    uid = (s && s.user && s.user.id) ? String(s.user.id) : "";
  } catch (e) { uid = ""; }
  var anon = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  window.posthog.init(key, {
    bootstrap: uid ? { distinctID: uid, isIdentifiedID: true } : { distinctID: anon },
    api_host: host,
    ui_host: "https://eu.posthog.com",
    persistence: "memory",
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    disable_surveys: true,
    session_recording: { maskAllInputs: true, maskTextSelector: "#whoEmail, [data-ph-mask]" }
  });
  window.pdTrack = function(ev, props){ try { window.posthog.capture(ev, props || {}); } catch (e) { /* never break the page */ } };
  window.pdIdentify = function(id, props){ try { if (id) window.posthog.identify(String(id), props || {}); } catch (e) { /* idem */ } };
})();

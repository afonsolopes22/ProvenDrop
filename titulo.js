/* ProvenDrop · collection titles without the store name.
   ONE implementation, used in two places:
     - the member area: app.html loads this file before app.js (window.pdLimparTitulo);
     - the daily e-mail: supabase/functions/email-diario imports it for its side effect (globalThis.pdLimparTitulo).
   It is a classic script on purpose (no export statement), so the same file runs in the browser and in Deno.

   pdLimparTitulo(colecao, loja, link) → the title without the part that names the store, or "" when the whole
   title is the store name (the caller then shows a neutral "Collection").
     "Men's Fashion | HERLINE London", "herline.uk"        → "Men's Fashion"
     "Lyra London - Laundry Baskets",  "lyra-london.co.uk" → "Laundry Baskets"
     "Herline Winter Jackets",         "herline.uk"        → "Winter Jackets"
   The store is identified by its domain (loja, or the host of the collection link). Without a usable domain the
   title is returned unchanged. Tests: supabase/functions/_shared/titulo.test.ts. */
(function (g) {
  "use strict";
  /* " | ", " - ", " – ", " — ", " · ", " • " (a hyphen only separates when it has spaces around it: "T-Shirts" stays) */
  var SEP = /\s+[|·•–—-]\s+|\s*\|\s*/;
  var SEGUNDO_NIVEL = { co: 1, com: 1, org: 1, net: 1, ac: 1, gov: 1, edu: 1 };
  var PONTAS = /^[\s|·•–—\-:,;\/]+|[\s|·•–—\-:,;\/]+$/g;

  function norm(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function host(v) {
    v = String(v == null ? "" : v).trim().toLowerCase();
    if (!v) return "";
    return v.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[\/?#:]/)[0];
  }
  /* "herline.uk" → "herline"; "lyra-london.co.uk" → "lyra-london"; "shop.modehaus-behrens.de" → "modehaus-behrens" */
  function nomeDaLoja(h) {
    if (!h || h.indexOf(".") < 0) return "";
    var p = h.split(".");
    p.pop();
    if (p.length > 1 && SEGUNDO_NIVEL[p[p.length - 1]]) p.pop();
    return p[p.length - 1] || "";
  }

  function limparTitulo(colecao, loja, link) {
    var t = String(colecao == null ? "" : colecao).replace(/\s+/g, " ").trim();
    if (!t) return "";
    var h = host(loja) || host(link);
    var chave = norm(nomeDaLoja(h)), dominio = norm(h);
    if (chave.length < 3) return t; /* no reliable store name to look for */
    var eLoja = function (parte) { var n = norm(parte); return n.indexOf(chave) >= 0 || n.indexOf(dominio) >= 0; };

    /* 1. Titles made of parts ("Collection | Store"): drop the parts that name the store. */
    var partes = t.split(SEP).map(function (x) { return x.trim(); }).filter(Boolean);
    if (partes.length > 1) {
      var ficam = partes.filter(function (x) { return !eLoja(x); });
      if (!ficam.length) return "";
      if (ficam.length < partes.length) return ficam.join(" | ");
    }
    if (!eLoja(t)) return t;

    /* 2. One part that still carries the store ("Herline Winter Jackets"): drop the words that spell it. */
    var palavras = t.split(" "), fica = [];
    for (var i = 0; i < palavras.length; i++) {
      var tirou = false;
      for (var n = Math.min(4, palavras.length - i); n >= 1 && !tirou; n--) {
        var junto = norm(palavras.slice(i, i + n).join(""));
        if (junto === chave || junto === dominio) { i += n - 1; tirou = true; }
      }
      if (!tirou) fica.push(palavras[i]);
    }
    return fica.join(" ").replace(PONTAS, "").replace(/\s+/g, " ").trim();
  }

  g.pdLimparTitulo = limparTitulo;
})(typeof globalThis !== "undefined" ? globalThis : this);

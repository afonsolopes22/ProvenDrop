# Domínio próprio: provendrop.com

Domínio previsto: **provendrop.com** (ainda não comprado em 2026-11-02). Até lá o site vive em `https://afonsolopes22.github.io/ProvenDrop/` e o e-mail sai pelo modo de teste do Resend. Esta página reúne tudo o que muda quando o domínio existir: os registos DNS para o GitHub Pages e para o Resend, e os sítios onde o URL do site está escrito.

**O ficheiro `CNAME` só se cria quando o domínio estiver comprado e os DNS apontados** (secção 2). Criá-lo antes parte o site: o GitHub Pages passa a servir só pelo domínio e este ainda não resolve.

## 1. Comprar o domínio

Qualquer registrador (Namecheap, Cloudflare Registrar, Amen, …). Nada a configurar no acto da compra; o que interessa é o painel de DNS desse registrador, onde se criam os registos abaixo. Se o registrador for a Cloudflare, deixar os registos do GitHub em **DNS only** (nuvem cinzenta), não *proxied*.

## 2. DNS para o GitHub Pages

No painel de DNS de `provendrop.com`:

| Tipo | Nome (host) | Valor | Para quê |
|---|---|---|---|
| `A` | `@` | `185.199.108.153` | raiz do domínio → GitHub Pages |
| `A` | `@` | `185.199.109.153` | idem (os quatro A juntos) |
| `A` | `@` | `185.199.110.153` | idem |
| `A` | `@` | `185.199.111.153` | idem |
| `AAAA` | `@` | `2606:50c0:8000::153` | IPv6 (opcional mas recomendado) |
| `AAAA` | `@` | `2606:50c0:8001::153` | idem |
| `AAAA` | `@` | `2606:50c0:8002::153` | idem |
| `AAAA` | `@` | `2606:50c0:8003::153` | idem |
| `CNAME` | `www` | `afonsolopes22.github.io` | `www.provendrop.com` → redirecciona para a raiz |

(Valores da documentação do GitHub "Managing a custom domain for your GitHub Pages site"; confirmar lá se mudaram.)

Depois, por esta ordem:

1. Esperar a propagação (minutos a 24 h): `nslookup provendrop.com` tem de devolver os quatro `185.199.x.153`.
2. Repositório → **Settings → Pages → Custom domain**: escrever `provendrop.com` → **Save**. O GitHub cria o commit com o ficheiro `CNAME` (conteúdo: `provendrop.com`, uma linha) no ramo publicado. Se preferires, crias tu o ficheiro na raiz com esse conteúdo exacto.
3. Esperar o **DNS check successful** e marcar **Enforce HTTPS** (o certificado demora alguns minutos a emitir).
4. Testar `https://provendrop.com/`, `https://provendrop.com/app.html` e `https://www.provendrop.com/` (deve redireccionar).

### O que muda no código e nos serviços quando o domínio estiver activo

| Onde | De | Para |
|---|---|---|
| Stripe → Payment Link Direct → **Depois do pagamento** | `…github.io/ProvenDrop/bem-vindo.html` | `https://provendrop.com/bem-vindo.html` |
| Stripe → Payment Link via Click → **Depois do pagamento** | `…/bem-vindo-click.html` | `https://provendrop.com/bem-vindo-click.html` |
| Stripe → Portal do cliente → link de regresso | `…/app.html` | `https://provendrop.com/app.html` |
| Supabase → Authentication → URL Configuration → **Site URL** e **Redirect URLs** | `…github.io/ProvenDrop/` e `…/app.html` | `https://provendrop.com/` e `https://provendrop.com/app.html` (manter os antigos durante a transição) |
| Segredo `APP_URL` (via `scripts\setup-supabase.ps1`, só esse valor) | `…/app.html` | `https://provendrop.com/app.html` |
| `scripts/setup-supabase.ps1` e `supabase/.env.example` | `APP_URL` do GitHub Pages | o novo URL |

O GitHub Pages redirecciona `afonsolopes22.github.io/ProvenDrop/…` para o domínio, por isso links antigos continuam a funcionar.

## 3. DNS para o Resend (envio de e-mail)

Resend → **Domains → Add Domain** → `provendrop.com` (região **EU (Ireland)**). O Resend mostra os registos exactos; são destes tipos (o valor de cada um é gerado pelo Resend, copiar de lá):

| Tipo | Nome (host) | Valor | Para quê |
|---|---|---|---|
| `TXT` | `resend._domainkey` | `p=MIG…` (chave DKIM) | assinatura DKIM |
| `MX` | `send` | `feedback-smtp.eu-west-1.amazonses.com`, prioridade `10` | Return-Path (devoluções) |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | SPF do Return-Path |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@provendrop.com` | DMARC (recomendado; `p=none` para começar) |

Depois **Verify DNS Records** → estado **Verified**. A partir daí:

- `EMAIL_FROM = "ProvenDrop <noreply@provendrop.com>"` (já é o valor proposto pelo `setup-supabase.ps1`; se estava `onboarding@resend.dev`, corre o script outra vez e muda só esse).
- Supabase → **Authentication → Emails → SMTP Settings → Sender email**: `noreply@provendrop.com`.
- Se o domínio também for usado para e-mail normal (Google Workspace, etc.), os registos `MX` da raiz (`@`) são os desse serviço; os do Resend ficam só em `send.provendrop.com` e não colidem.

## 4. Verificar

- `https://provendrop.com/` abre com cadeado; `config.js` carrega (DevTools → Network).
- Pagamento de teste → redirecciona para `https://provendrop.com/bem-vindo.html`.
- E-mail de boas-vindas chega de `noreply@provendrop.com` sem aviso de spam; o link abre `https://provendrop.com/app.html` com sessão.
- `https://mxtoolbox.com/SuperTool.aspx` → `dkim:provendrop.com:resend` e `dmarc:provendrop.com` sem erros.

# Domínio próprio: provendrop.com

**Estado (2026-11-08): domínio comprado na Cloudflare; DNS criados (só DNS, sem proxy): 4 `A` para `185.199.108-111.153` e `CNAME www → afonsolopes22.github.io`; ficheiro `CNAME` com `provendrop.com` na raiz do repositório; todos os endereços no código passaram a `https://provendrop.com/…`.** Falta o que está em "Passos à mão" abaixo. O e-mail ainda sai pelo modo de teste do Resend (secção 3).

Esta página reúne os registos DNS para o GitHub Pages e para o Resend e os sítios onde o URL do site está escrito.

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

### Passos à mão (por esta ordem, com os valores a colar)

1. **Propagação**: `nslookup provendrop.com` tem de devolver os quatro `185.199.x.153` (já devolvia a 2026-11-08).
2. **GitHub → repositório → Settings → Pages → Custom domain**: `provendrop.com` → **Save**. O ficheiro `CNAME` já está no ramo (o merge do PR do domínio é o que o publica); o GitHub só o valida. Esperar **DNS check successful**; quando aparecer, marcar **Enforce HTTPS** (o certificado Let's Encrypt demora de minutos a 1 h; se a caixa estiver cinzenta, voltar mais tarde).
3. **Supabase → Edge Functions → Secrets**: `APP_URL` = `https://provendrop.com/app.html` (é o único segredo com o endereço; `scripts\setup-supabase.ps1` já escreve este valor se o voltares a correr). As funções `stripe-webhook`, `email-diario` e `corrigir-email` leem-no no arranque: depois de mudar o segredo, voltar a fazer deploy das três (`supabase functions deploy <nome> --no-verify-jwt`) ou correr o `setup-supabase.ps1`.
4. **Supabase → Authentication → URL Configuration**: **Site URL** `https://provendrop.com/`; **Redirect URLs**: acrescentar `https://provendrop.com/**` e manter `https://afonsolopes22.github.io/ProvenDrop/**` e `http://127.0.0.1:8000/**` durante a transição (apagar o github.io quando o domínio estiver a servir com HTTPS há uns dias).
5. **Stripe → Payment Links**: Direct → **Depois do pagamento** → `https://provendrop.com/bem-vindo.html?session_id={CHECKOUT_SESSION_ID}`; via Click → `https://provendrop.com/bem-vindo-click.html?session_id={CHECKOUT_SESSION_ID}`. **Portal do cliente → Business information → Default redirect link**: `https://provendrop.com/app.html`. (Os links de pagamento em `config.js` continuam vazios até ao teste com o cupão TESTE100.)
6. Testar `https://provendrop.com/`, `https://provendrop.com/app.html` (pedir um link de entrada: o e-mail tem de trazer `https://provendrop.com/app.html?token_hash=…`) e `https://www.provendrop.com/` (deve redireccionar para a raiz).

O GitHub Pages redirecciona `afonsolopes22.github.io/ProvenDrop/…` para o domínio, por isso links antigos (e-mails já enviados) continuam a funcionar. Nota sobre `corrigir-email`: o CORS aceita a origem de `APP_URL` e, durante a transição, também `https://afonsolopes22.github.io`.

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

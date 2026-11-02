# Pôr a plataforma Direto a funcionar: ordem completa

Estado de partida (já feito): projecto Supabase `maljrfgnnhtrjunnwlre` (EU) com a migração `0001_plataforma.sql` aplicada (tabelas, RLS, bucket `kits`, job pg_cron de hora a hora); Stripe configurada em modo de teste (produtos, os dois Payment Links, portal, webhook); `config.js` com o URL e a anon key do Supabase e os links de teste do Stripe; a rotina diária já publica o feed com `_dados/publicar_plataforma.py`.

Falta, por esta ordem:

| # | Passo | Documento | Resultado |
|---|---|---|---|
| 1 | Instalar o Supabase CLI e `supabase login` | abaixo | CLI pronto |
| 2 | Stripe: `scripts\stripe-teste.ps1` uma vez (link de regresso + eventos de disputa/reembolso), depois copiar `sk_test_` e `whsec_` quando o setup os pedir | [STRIPE.md](STRIPE.md) | `STRIPE_LINK_RETURN` em `config.local.js`; os dois segredos à mão |
| 3 | Resend: conta, API key; sem domínio, `onboarding@resend.dev`; SMTP no Supabase Auth | [EMAIL.md](EMAIL.md) | `re_…`, remetente |
| 4 | `scripts\setup-supabase.ps1` | abaixo | segredos definidos, funções no ar, migração 0002 e `public.config` actualizados |
| 5 | Confirmar `config.js` (links vazios) e criar `config.local.js` | abaixo | site publicado com Subscribe desativado; em `localhost` o Subscribe abre o Checkout de teste |
| 6 | Teste completo em modo de teste | [TESTE.md](TESTE.md) | todos os passos verdes |
| 7 | Commit e PR; merge só com aprovação | README | site publicado |
| 8 | Quando `provendrop.com` for comprado: DNS do GitHub Pages e do Resend, `CNAME`, URLs no Stripe e no Supabase | [DOMINIO.md](DOMINIO.md) | site e e-mail no domínio próprio |

## 1. Supabase CLI

Windows (um dos dois):

```powershell
scoop install supabase
```

```powershell
winget install Supabase.CLI
```

Depois:

```powershell
supabase login
```

Abre o browser e pede um token de acesso; fica guardado no perfil do utilizador (não no repositório). Verifica com `supabase projects list`: o projecto `maljrfgnnhtrjunnwlre` tem de aparecer.

## 4. `scripts\setup-supabase.ps1`

Na raiz do repositório:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-supabase.ps1
```

O que faz, e o que te pede:

1. `supabase link --project-ref maljrfgnnhtrjunnwlre` (pode pedir a palavra-passe da base de dados: Supabase → **Project Settings** → **Database**).
2. Pede, **sem eco**, os três segredos (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`) e depois os identificadores e remetentes (`STRIPE_PRICE_DIRETO`, `STRIPE_PRICE_CLICK`, `STRIPE_PAYMENT_LINK_DIRETO`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `ALERT_EMAIL`). **Enter em qualquer campo = não alterar** (A6): não há valores de teste por omissão; os ids de teste estão no vault. `EMAIL_FROM`: `ProvenDrop <onboarding@resend.dev>` enquanto não houver domínio verificado, `ProvenDrop <noreply@provendrop.com>` depois. Define `STRIPE_ACCEPT_TEST` a partir do prefixo da chave (`sk_test_` → `1`), gera um `CRON_SECRET` aleatório, lê `HORA_ENVIO` de `config.js`, define `APP_URL` e `MAGIC_LINK_MINUTOS`. Os segredos vão num `.env` temporário só legível por ti (`icacls`), para `supabase secrets set --env-file`, e o ficheiro é sobrescrito e apagado no fim (S8): nada passa pela linha de comandos. Recusa misturas: `sk_live_` com ids/links de teste ou `EMAIL_FROM` de teste, `sk_test_` com links reais em `config.js`; `sk_live_` pede ainda "SIM".
3. `supabase functions deploy` de `stripe-webhook`, `email-diario` e `reconciliar` (`--no-verify-jwt`).
4. Corre as migrações `0002`, `0003` e `0004` e actualiza `public.config` (`email_diario_url`, `stripe_webhook_url`, `reconciliar_url`, `cron_secret`) com `supabase db query --linked`. Se falhar, escreve um `.sql` temporário em `%TEMP%`, pede-te para o colar no **SQL Editor** e apaga-o quando carregares Enter.

Opções: `-SemDeploy` (só segredos e SQL), `-SemSegredos` (só deploy e SQL). Podes voltar a correr quantas vezes quiseres.

Verificar: Supabase → **Edge Functions** mostra as três funções com deploy recente; **Edge Functions → Secrets** lista os nomes (nunca os valores), incluindo `STRIPE_ACCEPT_TEST` e `ALERT_EMAIL`; SQL Editor → `select chave, valor from public.config` mostra os três URLs e um `cron_secret` que não é `MUDAR-ESTE-VALOR`; `select jobname, schedule from cron.job` mostra `provendrop-email-diario` (`0 * * * *`), `provendrop-boas-vindas` (`*/15 * * * *`) e `provendrop-reconciliar` (`30 6 * * *`).

Gate de segredos local (S15), uma vez: `pip install pre-commit` e `pre-commit install` na raiz do repo; o gitleaks passa a correr antes de cada commit. Em CI corre em todos os pushes (`.github/workflows/secret-scan.yml`).

## 5. `config.js`

Só valores públicos. **Decisão S1 (2026-11-02):** em `main` os três links do Stripe ficam **vazios** até ao modo real (Subscribe desativado no site publicado); os links de **teste** vivem em `config.local.js`, que está no `.gitignore` e que `config.js` só carrega quando a página é servida em `localhost`/`127.0.0.1`:

| Chave | `config.js` (em `main`) | `config.local.js` (só local) | De onde |
|---|---|---|---|
| `STRIPE_LINK_DIRECT` | vazio até ao modo real | `https://buy.stripe.com/test_cNidRa…` | STRIPE.md a) |
| `STRIPE_PORTAL_LINK` | vazio até ao modo real | `https://billing.stripe.com/p/login/test_cNidRa…` | STRIPE.md c) |
| `STRIPE_LINK_RETURN` | vazio até ao modo real | URL impresso pelo `scripts\stripe-teste.ps1` (só mensalidade, para ex-membros) | STRIPE.md |
| `DAILY_TIME` | `09:00` | decidido em 2026-11-02; tem de bater com `HORA_ENVIO` |
| `PRICE_MONTHLY` / `PRICE_JOINING` | `15` / `25` | iguais aos preços do Stripe |
| `CONTACT_EMAIL` | opcional | aparece no rodapé e nas páginas de boas-vindas |
| `CTR` | vazio até haver campanhas documentadas | README |

Criar o ficheiro local: copiar `config.local.example.js` para `config.local.js` (já traz os dois links de teste; acrescentar o de regresso) e servir o site a partir da raiz do repositório:

```powershell
python -m http.server 8000
```

Em `http://localhost:8000/index.html` o botão **Subscribe** abre o Checkout de teste: é assim que se faz o passo 6. No GitHub Pages (e no domínio) `config.local.js` nem é pedido e o Subscribe fica desativado. **Antes de publicar para clientes**, escrevem-se os links reais em `config.js` (aprovação explícita).

## Onde fica cada coisa (resumo)

| | `config.js` (público, no repo) | `supabase secrets` (privado) | Supabase Dashboard |
|---|---|---|---|
| Stripe | URL do Payment Link, URL do portal | `sk_`, `whsec_`, `price_` ×2, `plink_` | — |
| E-mail | — | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | SMTP do Auth, template Magic Link, Redirect URLs |
| Hora | `DAILY_TIME` | `HORA_ENVIO` (derivado) | `cron.job` (0001) |
| Área | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `APP_URL`, `MAGIC_LINK_MINUTOS`, `CRON_SECRET` | `public.config` |

Nunca: chaves em `config.js`, no README, em commits, em mensagens ou no vault. A service role key da rotina diária vive fora do vault e do repo (`--key-file`).

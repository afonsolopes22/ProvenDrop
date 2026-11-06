# Pôr a plataforma Direto a funcionar: ordem completa

Estado de partida (já feito): projecto Supabase `maljrfgnnhtrjunnwlre` (EU) com as migrações `0001`–`0005` aplicadas (tabelas, RLS, bucket `kits`, pg_cron); Stripe em **modo real** desde 2026-11-06 (produtos, os dois Payment Links, portal, webhook — [STRIPE.md](STRIPE.md)); `config.js` com o URL e a anon key do Supabase e os links **reais** do Stripe; a rotina diária já publica o feed com `_dados/publicar_plataforma.py`. O modo de teste (2026-11-02 → 11-06) está resumido no fim de STRIPE.md.

Para a passagem a modo real, por esta ordem:

| # | Passo | Documento | Resultado |
|---|---|---|---|
| 1 | Supabase CLI instalado e `supabase login` | abaixo | CLI pronto |
| 2 | Stripe: copiar `sk_live_` e o `whsec_` do endpoint real quando o setup os pedir; acrescentar os eventos de disputa/reembolso ao endpoint | [STRIPE.md](STRIPE.md) | os dois segredos à mão |
| 3 | Resend: API key; sem domínio verificado o remetente continua `onboarding@resend.dev` (só entrega ao e-mail da conta); SMTP no Supabase Auth | [EMAIL.md](EMAIL.md) | `re_…`, remetente |
| 4 | `scripts\setup-supabase.ps1` (os `price_` reais são os valores por omissão) | abaixo | segredos definidos, SQL aplicado, funções no ar, `stripe-webhook` com novo deploy no fim |
| 5 | Confirmar `config.js` (links reais) | abaixo | site publicado com Subscribe a abrir o Checkout real |
| 6 | Teste real | [TESTE.md](TESTE.md) §7 | todos os passos verdes |
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
2. Pede, **sem eco** (`Read-Host -AsSecureString`, nunca mostrados nem gravados no repositório), os três segredos (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`) e depois os identificadores e remetentes (`STRIPE_PRICE_DIRETO`, `STRIPE_PRICE_CLICK`, `STRIPE_PAYMENT_LINK_DIRETO`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `ALERT_EMAIL`). **Enter = não alterar** esse segredo (A6): `RESEND_API_KEY` ou `EMAIL_FROM` vazios ficam como estão no Supabase. Exceção desde 2026-11-06: Enter em `STRIPE_PRICE_DIRETO` / `STRIPE_PRICE_CLICK` escreve os **preços reais** (STRIPE.md). `EMAIL_FROM`: `ProvenDrop <onboarding@resend.dev>` enquanto não houver domínio verificado, `ProvenDrop <noreply@provendrop.com>` depois. Define `STRIPE_ACCEPT_TEST` a partir do prefixo da chave (`sk_live_` → `0`), gera um `CRON_SECRET` aleatório, lê `HORA_ENVIO` de `config.js`, define `APP_URL` e `MAGIC_LINK_MINUTOS`. Os segredos vão num `.env` temporário só legível por ti (`icacls`), para `supabase secrets set --env-file`, e o ficheiro é sobrescrito e apagado no fim (S8): nada passa pela linha de comandos. Recusa misturas: `sk_live_` com ids/links de teste ou `EMAIL_FROM` de teste, `sk_test_` com links reais em `config.js`; `sk_live_` pede ainda "SIM".
3. Corre as migrações `0002`–`0006` e actualiza `public.config` (`email_diario_url`, `stripe_webhook_url`, `reconciliar_url`, `cron_secret`) com `supabase db query --linked`. Se falhar, escreve um `.sql` temporário em `%TEMP%`, pede-te para o colar no **SQL Editor** e apaga-o quando carregares Enter.
4. `supabase functions deploy` de `email-diario`, `reconciliar` e `corrigir-email` (correção do e-mail errado no checkout, EMAIL.md §7; usa os mesmos segredos do webhook) e, **no fim**, de `stripe-webhook` (todas com `--no-verify-jwt`), para a função arrancar já com os segredos novos.

Opções: `-SemDeploy` (só segredos e SQL), `-SemSegredos` (só deploy e SQL). Podes voltar a correr quantas vezes quiseres.

Verificar: Supabase → **Edge Functions** mostra as quatro funções (`stripe-webhook`, `email-diario`, `reconciliar`, `corrigir-email`) com deploy recente; **Edge Functions → Secrets** lista os nomes (nunca os valores), incluindo `STRIPE_ACCEPT_TEST` e `ALERT_EMAIL`; SQL Editor → `select chave, valor from public.config` mostra os três URLs e um `cron_secret` que não é `MUDAR-ESTE-VALOR`; `select jobname, schedule from cron.job` mostra `provendrop-email-diario` (`0 * * * *`), `provendrop-boas-vindas` (`*/15 * * * *`) e `provendrop-reconciliar` (`30 6 * * *`).

Gate de segredos local (S15), uma vez: `pip install pre-commit` e `pre-commit install` na raiz do repo; o gitleaks passa a correr antes de cada commit. Em CI corre em todos os pushes (`.github/workflows/secret-scan.yml`).

## 5. `config.js`

Só valores públicos. Desde 2026-11-06 `config.js` em `main` tem os links **reais** do Stripe (S1 continua válido para testes: os links de **teste** vivem em `config.local.js`, que está no `.gitignore` e que `config.js` só carrega quando a página é servida em `localhost`/`127.0.0.1`):

| Chave | `config.js` (em `main`) | `config.local.js` (só local) | De onde |
|---|---|---|---|
| `STRIPE_LINK_DIRECT` | link real Direct (`buy.stripe.com/7sYaEY…`) | link de teste (vault) | STRIPE.md a) |
| `STRIPE_PORTAL_LINK` | portal real (`billing.stripe.com/p/login/7sYaEY…`) | portal de teste (vault) | STRIPE.md c) |
| `STRIPE_LINK_RETURN` | vazio até existir o link de regresso real | URL impresso pelo `scripts\stripe-teste.ps1` (só mensalidade, para ex-membros) | STRIPE.md |
| `DAILY_TIME` | `09:00` | decidido em 2026-11-02; tem de bater com `HORA_ENVIO` |
| `PRICE_MONTHLY` / `PRICE_JOINING` | `15` / `25` | iguais aos preços do Stripe |
| `CONTACT_EMAIL` | opcional | aparece no rodapé de todas as páginas (site, área, boas-vindas, termos/privacidade/reembolsos) quando preenchido |
| `CTR` | vazio até haver campanhas documentadas | README |

Para voltar a testar em modo de teste: copiar `config.local.example.js` para `config.local.js`, preencher com os links de teste do vault e servir o site a partir da raiz do repositório:

```powershell
python -m http.server 8000
```

Em `http://localhost:8000/index.html` o botão **Subscribe** abre então o Checkout de teste. No GitHub Pages (e no domínio) `config.local.js` nem é pedido e o Subscribe abre o Checkout **real** de `config.js`.

## Onde fica cada coisa (resumo)

| | `config.js` (público, no repo) | `supabase secrets` (privado) | Supabase Dashboard |
|---|---|---|---|
| Stripe | URL do Payment Link, URL do portal | `sk_`, `whsec_`, `price_` ×2, `plink_` | — |
| E-mail | — | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | SMTP do Auth, template Magic Link, Redirect URLs |
| Hora | `DAILY_TIME` | `HORA_ENVIO` (derivado) | `cron.job` (0001) |
| Área | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `APP_URL`, `MAGIC_LINK_MINUTOS`, `CRON_SECRET` | `public.config` |

Nunca: chaves em `config.js`, no README, em commits, em mensagens ou no vault. A service role key da rotina diária vive fora do vault e do repo (`--key-file`).

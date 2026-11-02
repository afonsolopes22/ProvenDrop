# Pôr a plataforma Direto a funcionar: ordem completa

Estado de partida (já feito): projecto Supabase `maljrfgnnhtrjunnwlre` (EU) com a migração `0001_plataforma.sql` aplicada (tabelas, RLS, bucket `kits`, job pg_cron de hora a hora); `config.js` com o URL e a anon key; a rotina diária já publica o feed com `_dados/publicar_plataforma.py`.

Falta, por esta ordem:

| # | Passo | Documento | Resultado |
|---|---|---|---|
| 1 | Instalar o Supabase CLI e `supabase login` | abaixo | CLI pronto |
| 2 | Stripe em modo de teste: produto, Payment Link, link da Click, portal, webhook, secret key | [STRIPE.md](STRIPE.md) | `sk_test_`, `whsec_`, `price_` ×2, URL do link, URL do portal |
| 3 | Resend: conta, domínio, API key, `EMAIL_FROM`; SMTP no Supabase Auth | [EMAIL.md](EMAIL.md) | `re_…`, remetente |
| 4 | `scripts\setup-supabase.ps1` | abaixo | segredos definidos, funções no ar, migração 0002 e `public.config` actualizados |
| 5 | Preencher `config.js` | abaixo | botão Subscribe e portal activos |
| 6 | Teste completo em modo de teste | [TESTE.md](TESTE.md) | todos os passos verdes |
| 7 | Commit e PR; merge só com aprovação | README | site publicado |

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
2. Pede, **sem eco e sem gravar em disco**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_DIRETO`, `STRIPE_PRICE_CLICK`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`. Enter em branco = não alterar esse segredo. Gera um `CRON_SECRET` aleatório. Lê `HORA_ENVIO` de `config.js` (`DAILY_TIME: "09:00"` → `9`). Define `APP_URL` e `MAGIC_LINK_MINUTOS`. Corre `supabase secrets set` com tudo isso. Recusa chaves `sk_live_` sem confirmação explícita.
3. `supabase functions deploy stripe-webhook --no-verify-jwt` e `supabase functions deploy email-diario --no-verify-jwt`.
4. Corre a migração `0002_kits_datas.sql` e actualiza `public.config` (`email_diario_url`, `cron_secret`) com `supabase db query`. Se o CLI instalado não tiver esse comando, escreve um `.sql` temporário em `%TEMP%`, pede-te para o colar no **SQL Editor** e apaga-o quando carregares Enter.

Opções: `-SemDeploy` (só segredos e SQL), `-SemSegredos` (só deploy e SQL). Podes voltar a correr quantas vezes quiseres.

Verificar: Supabase → **Edge Functions** mostra as duas funções com deploy recente; **Edge Functions → Secrets** lista os nomes (nunca os valores); SQL Editor → `select * from public.config` mostra o URL da função e `cron_secret` preenchido; `select * from cron.job` mostra `provendrop-email-diario`.

## 5. `config.js`

Só valores públicos:

| Chave | Valor | De onde |
|---|---|---|
| `STRIPE_LINK_DIRECT` | `https://buy.stripe.com/test_…` | STRIPE.md a) |
| `STRIPE_PORTAL_LINK` | `https://billing.stripe.com/p/login/test_…` | STRIPE.md c) |
| `DAILY_TIME` | `09:00` | decidido em 2026-11-02; tem de bater com `HORA_ENVIO` |
| `PRICE_MONTHLY` / `PRICE_JOINING` | `15` / `25` | iguais aos preços do Stripe |
| `CONTACT_EMAIL` | opcional | aparece no rodapé e nas páginas de boas-vindas |
| `CTR` | vazio até haver campanhas documentadas | README |

Com os links de teste, o botão **Subscribe** do site abre o Checkout de teste: é assim que se faz o passo 6. **Antes de publicar para clientes**, trocam-se pelos links reais (aprovação explícita).

## Onde fica cada coisa (resumo)

| | `config.js` (público, no repo) | `supabase secrets` (privado) | Supabase Dashboard |
|---|---|---|---|
| Stripe | URL do Payment Link, URL do portal | `sk_`, `whsec_`, `price_` ×2, `plink_` | — |
| E-mail | — | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | SMTP do Auth, template Magic Link, Redirect URLs |
| Hora | `DAILY_TIME` | `HORA_ENVIO` (derivado) | `cron.job` (0001) |
| Área | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `APP_URL`, `MAGIC_LINK_MINUTOS`, `CRON_SECRET` | `public.config` |

Nunca: chaves em `config.js`, no README, em commits, em mensagens ou no vault. A service role key da rotina diária vive fora do vault e do repo (`--key-file`).

# Revisão de segurança do PR #1 (plataforma-direto)

Revisão só de leitura (2026-11-02) antes de fundir o PR #1, no commit `c5b4281`. Cobre todo o histórico git (todos os ramos, reflog e objetos soltos), as migrações, as Edge Functions, as páginas públicas, o `app.html` e o `.gitignore`. Também foram feitos pedidos só de leitura ao Supabase público com a anon key, a funções sem segredo e à folha pública. Nada foi escrito em Supabase nem Stripe. Segredos: nenhum valor completo é mostrado (máximo 6 caracteres).

**Veredito (à data da revisão):** não fundir ainda. 1 bloqueador crítico (S1), 1 alto ainda ativo (S2) e 1 crítico condicional (S3). O resto é corrigível no próprio PR.

O estado de cada achado depois das correções está na secção **Estado dos achados** no fim.

## Tabela de achados

| ID | Gravidade | Onde | Achado |
|---|---|---|---|
| S1 | Crítico (condicional) | `config.js:21,25`, `stripe-webhook/index.ts:85-89,95` | O site público usa links Stripe de teste e o webhook de teste escreve na base de dados real. Qualquer visitante paga com o cartão 4242… e fica `origem=direto, estado=ativo`, com acesso a `feed_dia`, `verdes` e kits reais (nomes de lojas, links, zips). Hoje só é travado porque o Resend de teste (`onboarding@resend.dev`) entrega apenas ao e-mail da conta. Com o domínio verificado fica aberto. O webhook nunca verifica `evento.livemode`. |
| S2 | Alto (ativo) | histórico git, commits `2d44049` e `e1d6a14`, ficheiro `data.json` | `data.json` foi publicado em `origin/main` em 2026-11-01. Contém 3 lojas, links de coleções e 2 links de zip no Drive. O histórico foi reescrito (hoje `main` começa em `e2fe105`, sem `data.json`), mas: (a) `github.com/…/commit/2d44049…` e `raw.githubusercontent.com/…/2d44049…/data.json` ainda respondem HTTP 200; (b) o link do Drive (id `14CV3i…`) ainda descarrega 3,5 MB sem login; (c) os objetos continuam no reflog e como objeto solto neste PC. Não está em nenhum ramo atual. |
| S3 | Alto | `stripe-webhook/index.ts:156-169,206-211` | `upsert onConflict email` sobrescreve `origem`. Quem pagar pelo link da Click com o e-mail de um membro Direct muda-o para `click` e ele perde o acesso. O inverso também funciona. O e-mail do Checkout não é verificado. |
| S4 | Médio | Auth do Supabase (`/auth/v1/settings: disable_signup:false`) | Registos abertos. Risco de pre-hijacking: um atacante regista o e-mail da vítima com palavra-passe antes de ela pagar. Mais tarde o webhook apanha "already exists", gera o magic link e confirma o e-mail. A palavra-passe do atacante continua válida. Os utilizadores são criados por `admin.createUser`, que funciona com registos fechados. |
| S5 | Médio | `stripe-webhook/index.ts:77`, `email-diario/index.ts:81` | `x-cron-secret` comparado com `!==` (não constante no tempo). Também não há limite de tentativas. |
| S6 | Médio | `app.html:149` | `supabase-js` carregado do CDN sem `integrity` (SRI). O script manipula o token de sessão. Também não há CSP em nenhuma página. |
| S7 | Médio | `app.html:389-392,444-445`, `feed_dia.zip_url`/`verdes.zip_url` | Fallback `zip_url` = links do Drive "qualquer pessoa com o link". Não passam pela RLS. Um membro pode partilhá-los. É a mesma classe de fuga de S2. |
| S8 | Médio | `scripts/setup-supabase.ps1:116-119` | `sk_test_`/`whsec_`/`re_`/`CRON_SECRET` passados como argumentos de linha de comando a `supabase secrets set`. Ficam visíveis na lista de processos. A variável `$args` colide com a automática do PowerShell. |
| S9 | Médio | Folha pública `1o-qSJ…` (`index.html:976`) | O gviz serve qualquer separador por nome. Hoje `hoje`, `info` e `arquivo` só têm números, nicho, mercado e estado (verificado). Mas se alguém acrescentar um separador com nomes ou links, fica legível por qualquer pessoa. A célula `nota` em `info` é texto livre. |
| S10 | Baixo | `0001_plataforma.sql:123-126` | `public.config` nasce com `cron_secret='MUDAR-ESTE-VALOR'`, valor público no repositório. Só é seguro depois de o setup o substituir. |
| S11 | Baixo | `app.html:315-320` | Enumeração de e-mails: a mensagem distingue "tem/não tem subscrição". |
| S12 | Baixo | `app.html:315` | Fluxo implicit (tokens no fragmento do URL). Preferir PKCE. Os scanners de e-mail podem consumir o magic link. |
| S13 | Baixo | `stripe-webhook/index.ts:128,231` | Erro interno devolvido ao chamador e e-mail do cliente (PII) nos logs. `semSegredos()` só existe em `email-diario`. |
| S14 | Baixo | `docs/STRIPE.md:3`, `README.md:60` | Repositório público publica o `acct_` completo, ids `prod_`/`price_`/`plink_`/`we_`, o caminho do ficheiro da service key e os nomes dos scripts privados. |
| S15 | Baixo | `.gitignore` | Não cobre `data.json`, `*.zip`, `feed_bot.json`, `*.csv`, `*.bak`, `*service_key*`. Não há gate de segredos (pré-commit/CI). |
| S16 | Info | `membro_ativo_direto()` | anon consegue chamar o RPC (devolve false). Inofensivo. |
| S17 | Info | Número +351 920 117 648 em `bem-vindo-click.html` | WhatsApp da Click, intencional. |

## Verificado e correto (sem achado)

- Segredos em todo o histórico (20 commits, todos os ramos, reflog, objeto solto): zero valores `sk_live`/`sk_test`, `whsec_`, `re_`, JWT service_role, chaves kie/dataforseo. Os hits são só nomes de variáveis.
- Folha privada `13yyuHCp…`: nunca aparece no histórico nem nos ficheiros atuais.
- JWT em `config.js`: payload `role:"anon"`, projeto `maljrfgn…`, exp 2109. Público por desenho.
- RLS (migração 0001): ativa nas 6 tabelas. `revoke all` a anon/authenticated e `grant` só do necessário. `feed_dia`, `verdes` e `storage.objects` (bucket `kits`) só leem com `membro_ativo_direto()`. `subscritores`: o membro lê só a sua linha e só pode atualizar `nichos`, `paises`, `guia_visto`. `config`, `stripe_eventos`, `envios_diarios` sem políticas, só service role.
- Teste ao vivo com a anon key: 401 em `feed_dia`, `verdes`, `subscritores`, `config`, `stripe_eventos` e `envios_diarios`. Listagem do bucket `kits` devolve `[]`. `email-diario` sem cabeçalho dá 401. Webhook sem assinatura dá 400. `?reenviar_boas_vindas=` sem segredo dá 401.
- Webhook: assinatura verificada com `constructEventAsync` e o segredo é obrigatório (500 se faltar). Idempotência por `stripe_eventos`. Sem CORS. `--no-verify-jwt` só nas 2 funções que o precisam. Nenhuma chave é registada nos logs.
- `app.html` XSS: todos os campos do feed passam por `esc()` antes do `innerHTML`; `url()` só aceita http(s).
- Signed URLs: caminho vem de `zip_path` (escrito pelo serviço), RLS aplicada ao gerar.
- Páginas públicas e `config.js`: só valores públicos. O único `.env*` seguido é `supabase/.env.example`.

## O que o Afonso tem de fazer à mão (por ordem)

1. **Drive (S2, equivale a rodar a chave):** abrir o ficheiro do zip cujo link estava em `data.json` e fazer Partilhar → Acesso geral → Restrito, ou apagá-lo. Voltar a enviar o kit pelo Storage privado (`publicar_plataforma.py` já o faz).
2. Pedir ao GitHub que apague as vistas em cache dos commits antigos: github.com/contact → "Sensitive data removal", indicando `afonsolopes22/ProvenDrop` e os commits `2d44049` e `e1d6a14` (hashes completos com `git rev-parse`). Dizer que a história já foi reescrita. Perguntar se existem forks.
3. Neste PC, para largar as cópias antigas: `git reflog expire --expire=now --all`, depois `git gc --prune=now`. Irreversível; só o Afonso decide quando.
4. Supabase → Authentication → Sign In / Providers → desativar **Allow new users to sign up** (S4). Confirmar em URL Configuration → Redirect URLs que só existem as URLs exatas de `app.html`.
5. Não passar o site a produção com os links de teste (S1). **Decidido em 2026-11-02:** `main` publica-se com `STRIPE_LINK_DIRECT`, `STRIPE_LINK_RETURN` e `STRIPE_PORTAL_LINK` vazios em `config.js` (Subscribe desativado) até ao modo real; os links de teste ficam em `config.local.js` (no `.gitignore`), carregado por `config.js` só quando a página é servida em `localhost`. Apagar os subscritores de teste (`docs/TESTE.md §5`).
6. Google Sheets: confirmar que a folha pública `1o-qSJ…` tem só 3 separadores, em modo Leitor e distinta da folha privada. Rever o texto de `info!nota`.
7. Depois de correr o setup, confirmar `select valor <> 'MUDAR-ESTE-VALOR' from config where chave='cron_secret'` (S10).
8. Se alguma vez um `sk_`, `whsec_` ou `re_` passar por linha de comando/gravação de ecrã: rodar em Stripe → Chaves de API → Reverter, Webhooks → Reverter segredo, e Resend → apagar a chave (S8).

## O que o Claude Code deve corrigir (por ordem)

1. S1: no `stripe-webhook`, recusar eventos `livemode=false` quando `STRIPE_ACCEPT_TEST != "1"` (200 vazio, aviso no log). Documentar.
2. S3: não sobrescrever `origem` de uma linha existente direto/ativo por um evento click (ou vice-versa).
3. S5: `cronSecretOk()` partilhado em `_shared/`: comparar o SHA-256 de ambos os valores em tempo constante. Nas 2 funções.
4. S6: `integrity="sha384-…"` no `supabase-js` fixado ou servir localmente; CSP em `app.html`.
5. S7: deixar de mostrar `zip_url` em `app.html`; só `zip_path`. `SIGNED_URL_SECONDS` = 120.
6. S8: `setup-supabase.ps1`: segredos num `.env` temporário com ACL só para o utilizador, `supabase secrets set --env-file`, apagar no `finally`; renomear `$args`.
7. S10: migração que gere o `cron_secret` aleatório se ainda for `MUDAR…`.
8. S12/S13/S11: `flowType:'pkce'`; `semSegredos()` e mensagem genérica no webhook; resposta de login neutra.
9. S14/S15: `.gitignore`; `.pre-commit-config.yaml` + `.gitleaks.toml` + workflow gitleaks (`fetch-depth: 0`). Retirar de `docs/STRIPE.md`/`README.md` o `acct_` completo e o caminho da service key.
10. Atualizar `docs/TESTE.md §4.2–4.4` com os resultados ao vivo.

## Estado dos achados (2026-11-02, depois das correções no ramo `plataforma-direto`)

| ID | Estado | Onde / como |
|---|---|---|
| S1 | ✅ corrigido | `stripe-webhook`: eventos do modo errado recebem 200 vazio + aviso (`STRIPE_ACCEPT_TEST`, definido pelo `setup-supabase.ps1` a partir do prefixo da chave). Site: `config.js` com os três links do Stripe **vazios** em `main` (Subscribe desativado) até ao modo real; links de teste só em `config.local.js` (`.gitignore`), carregado apenas em `localhost` (decisão de 2026-11-02). |
| S2 | ⏳ Afonso | Drive → Restrito; pedido ao GitHub; `git reflog expire` + `gc` neste PC. Nada que o código possa fazer. |
| S3 | ✅ corrigido | Tabela `subscricoes` + `recalcular_subscritor`: um evento click nunca retira acesso a uma direto. |
| S4 | ⏳ Afonso | Authentication → desligar "Allow new users to sign up"; Redirect URLs só `app.html`. |
| S5 | ✅ corrigido | `_shared/auth.ts` (SHA-256 dos dois valores, comparação em tempo constante) nas 3 funções. |
| S6 | ✅ corrigido | `app.html`: CSP estrita (sem scripts inline; lógica em `app.js`), `integrity` sha384 no `supabase-js@2.49.1`. |
| S7 | ⚠️ aceite em parte (2026-11-08) | `app.js` usa `zip_path` (Storage privado, signed URL de 120 s) sempre que existe. Por decisão do Afonso, as linhas que **só** têm link externo (`zip_url`, ex.: listas de 1 de novembro e os 7 registos antigos de `verdes`) voltam a mostrar "Download Launch Kit" a abrir esse link em nova aba: esses links do Drive continuam fora da RLS e partilháveis. Mitigação possível: enviar esses zips para o bucket `kits` com `publicar_plataforma.py` (fica `zip_path` e o link externo deixa de ser usado). |
| S8 | ✅ corrigido | `setup-supabase.ps1`: `.env` temporário com ACL só do utilizador, `--env-file`, sobrescrito e apagado no `finally`; `$args` → `$argumentos`. |
| S9 | ⏳ Afonso | Confirmar os 3 separadores da folha pública e o texto de `info!nota`. O `index.html` só lê `hoje`, `info` e `arquivo`. |
| S10 | ✅ corrigido | Migração 0004 gera `cron_secret` aleatório se ainda for `MUDAR-ESTE-VALOR` (e o setup substitui-o sempre). |
| S11 | ✅ corrigido | `app.js`: resposta de login neutra. |
| S12 | ✅ corrigido | `app.js`: `flowType: "pkce"`; links de e-mail por `token_hash` consumidos só por `verifyOtp`. Template do Auth em EMAIL.md §5. |
| S13 | ✅ corrigido | `_shared/log.ts`: respostas 500 dizem "erro interno"; e-mails nos logs como `u:<hash>`; `semSegredos()` nas 3 funções. |
| S14 | ✅ corrigido | `acct_` retirado de STRIPE.md; caminho da service key retirado do README. Os ids `price_/plink_/we_` de teste ficam (públicos, necessários). |
| S15 | ✅ corrigido | `.gitignore` (data.json, feed_bot.json, *.zip, *.csv, *.bak, *service_key*, .provendrop/, `/32`), `.gitleaks.toml`, `.pre-commit-config.yaml`, workflow `secret-scan.yml` com `fetch-depth: 0`. |
| S16/S17 | — | Informativos. |

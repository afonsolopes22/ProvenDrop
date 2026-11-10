---
data: 2026-11-08
tags: [provendrop, plano]
estado: para revisão do Afonso
---
# ProvenDrop × Click com acesso à plataforma: plano de execução

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos com caixas (`- [ ]`).

**Goal:** os clientes da Click pagam €15/mês sem adesão, são validados pela Click e entram na área de membros completa; o grupo de WhatsApp recebe uma mensagem diária em inglês com links curtos para as coleções.

**Architecture:** o acesso continua a ser decidido por `public.tem_acesso()` (SQL), agora também verdadeiro para `origem='click'` com `estado_click='validado'`; uma página de administração chama uma Edge Function nova (`admin-click`) que valida ou reembolsa. A rotina do vault calcula um `id_curto` estável por coleção, escreve-o em `feed_dia` e usa-o na mensagem do bot; `provendrop.com/c/<id>` é resolvido pelo `404.html` do GitHub Pages para `app.html?c=<id>`.

**Tech Stack:** GitHub Pages (HTML + JS sem build, Tailwind compilado), Supabase (Postgres, Auth magic link, Edge Functions Deno, Storage), Stripe (Payment Links, webhooks, Refunds API), Python 3 na rotina (`_dados/`).

**Spec:** `_dados/provendrop/Desenho — plano Click com plataforma (2026-11-08).md` (cópia no repositório: `docs/superpowers/specs/2026-11-08-click-plan-design.md`).

## Global Constraints
- Todo o texto visível ao cliente (site, app, e-mails ao cliente, mensagem de WhatsApp, kits) em **inglês**; nada em português (o teste `sem_pt` de cada tarefa verifica).
- Avisos de compra/cancelamento Click vão **só** para `ALERT_EMAIL` (Afonso). A Click nunca recebe e-mails do sistema.
- Não-cliente da Click → **reembolso total** + cancelamento imediato da subscrição.
- Plano Click: €15/mês, sem adesão (`STRIPE_PRICE_CLICK`); plano Platform: €40 no 1.º mês, depois €15/mês. Preços não mudam neste plano.
- WhatsApp da Click: `+351 920 414 823` (`https://wa.me/351920414823`).
- Mensagem de WhatsApp do cliente, exata: `Hi! I've just paid for the ProvenDrop Click plan. Purchase code: PD-XXXXXX. Store: <nome>. I'd like access to the WhatsApp bot.`
- Chaves (`sk_live`, `whsec`, service role, `supabase.key`) nunca impressas, copiadas para ficheiros ou coladas no chat.
- Nenhuma escrita na base de produção sem a migração estar no repositório; migrações idempotentes (`if not exists`, `create or replace`).

## Review Focus
1. **Clientes Click já existentes** (pagaram antes desta mudança) → continuam com o que tinham e ganham acesso à área: a migração marca-os `validado` (teste na Tarefa R1).
2. **Link `/c/<id>` desconhecido ou de coleção retirada** (`retirada=true`) → abre a Library com "This collection is no longer available." em vez de ecrã vazio ou erro (Tarefa R7).
3. **Reject & refund carregado duas vezes, ou compra com um código de teste de uso único, criado no Stripe (fatura de €0)** → a segunda vez não faz nada; €0 não chama a Refunds API, só cancela (Tarefa R4).
4. **Link da coleção com variações** (`/` no fim, `?query`, maiúsculas, `http` vs `https`) → o mesmo `id_curto` (Tarefa V1).
5. **Nicho ou país sem tradução** → a mensagem não deixa passar português: nicho desconhecido é omitido, país desconhecido aparece como código (Tarefa V1).

---

## Ordem de lançamento
R1 → R2 → R3 → R4 → R5 → R6 → R7 (Claude Code, PRs separados ou um só ramo) → A1 (Afonso, Stripe) → V1 → V2 → V3 (rotina) → A2 (teste) → A3 (mensagem à Click).
A rotina **só** muda para a mensagem nova (V1) depois de R7 estar em produção, senão os links `/c/` dão 404.

---

## Parte R — Claude Code (repositório `afonsolopes22/ProvenDrop`, ramo a partir de `main` atualizado)

### Tarefa R1: migração 0009 (estado Click, loja, id curto, acesso)

**Files:**
- Create: `supabase/migrations/0009_click_plataforma.sql`
- Test: `supabase/tests/0009_click_plataforma.sql` (corre com `supabase db test` ou no SQL Editor dentro de `begin … rollback`)

**Interfaces:**
- Produces: `subscritores.estado_click text check (estado_click in ('pendente','validado','recusado'))` (null para direto); `subscritores.loja text`; `feed_dia.id_curto text` + índice `feed_dia_id_curto (id_curto, dia desc)`; `tem_acesso(s)` novo.

- [ ] **Passo 1: testes que falham** (`begin; … rollback;`, com linhas de teste inseridas):
  - `tem_acesso` de `origem='click', estado='ativo', estado_click='validado'` = true
  - `origem='click', estado='ativo', estado_click='pendente'` = false; `'recusado'` = false
  - `origem='direto', estado='ativo', estado_click=null` = true (sem regressão)
  - depois da migração, toda a linha `origem='click'` que existia com `estado='ativo'` tem `estado_click='validado'`
- [ ] **Passo 2:** correr; esperado FAIL (coluna `estado_click` não existe).
- [ ] **Passo 3: migração.** Colunas acima; backfill `update subscritores set estado_click='validado' where origem='click' and estado_click is null;`; `default` da coluna fica null (o webhook escreve `pendente` explicitamente). `tem_acesso`: `s.bloqueado_em is null and (s.origem='direto' or (s.origem='click' and s.estado_click='validado')) and (` regra atual de ativo/em_atraso `)`. `membro_ativo_direto()` mantém o nome (políticas dependem dele). `grant update` do membro continua limitado a nichos, paises, guia_visto.
- [ ] **Passo 4:** correr; esperado PASS.
- [ ] **Passo 5:** commit `feat(db): 0009 estado_click, loja, id_curto e acesso Click validado`. Aplicar em produção só com autorização do Afonso (ou ele cola no SQL Editor).

### Tarefa R2: webhook guarda loja e estado pendente; sem boas-vindas para Click pendente

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts` (`registarCompraClick`, `temAcesso`, `varrerBoasVindas`, `reenviarBoasVindas`)
- Create: `supabase/functions/_shared/loja.ts` + `loja.test.ts`

**Interfaces:**
- Consumes: colunas de R1.
- Produces: `lojaDaSessao(s: { custom_fields?: Array<{ key: string; text?: { value?: string | null } }> }): string | null` — primeiro campo personalizado com `type === "text"` (o Stripe gera a `key` a partir do rótulo; não depender dela), `trim`, espaços colapsados, máx. 80 caracteres, vazio → null.

- [ ] **Passo 1: testes** em `loja.test.ts`: `"  Bella  Shop "` → `"Bella Shop"`; sem campo → `null`; 200 caracteres → 80; campo de outro tipo (dropdown) → `null`; campo de texto com qualquer key → valor lido.
- [ ] **Passo 2:** `deno test supabase/functions/_shared/loja.test.ts` → FAIL.
- [ ] **Passo 3:** implementar `lojaDaSessao`; em `registarCompraClick` gravar `loja` e `estado_click: 'pendente'` **só se** `estado_click` ainda for null (uma renovação ou um evento repetido nunca volta a pôr `pendente` quem já está `validado`); acrescentar `Store: <loja ?? "—">` ao alerta e trocar a última linha do alerta por `Confirm the payment, then tell Click: "<codigo> paid". Validate or reject at provendrop.com/admin.html.` O espelho `temAcesso` no webhook passa a seguir a regra de R1 e `CAMPOS` inclui `estado_click`. `varrerBoasVindas` e `reenviarBoasVindas` deixam de excluir Click validado (filtro por `tem_acesso`, não por `origem='direto'`). Quando uma subscrição Click passa a `cancelado`, alerta ao `ALERT_EMAIL`: assunto `Click subscription cancelled · <codigo>`, linhas Name/Phone/Store/E-mail e `Tell Click to remove them from the WhatsApp group.` (teste: evento `customer.subscription.deleted` de uma Click → um alerta; de uma direto → nenhum).
- [ ] **Passo 4:** `deno test supabase/functions/` → PASS (incluindo `compat.test.ts`).
- [ ] **Passo 5:** commit `feat(webhook): loja e estado pendente nas compras Click`.

### Tarefa R3: bem-vindo-click com loja e texto novo

**Files:**
- Create: `supabase/functions/loja-click/index.ts` (verify_jwt = false em `config.toml`)
- Modify: `bem-vindo-click.html`

**Interfaces:**
- Produces: `GET /functions/v1/loja-click?session_id=cs_…` → `200 {"loja": string|null}`; `404 {}` se a sessão não existe, não é `origem=click`, não está `complete` ou tem mais de 24 h. Usa `lojaDaSessao` de R2. Nunca devolve e-mail, nome ou telefone.

- [ ] **Passo 1: testes** (Deno, Stripe simulado): sessão click completa de há 1 h → `{"loja":"Bella Shop"}`; sessão direto → 404; sessão de há 25 h → 404; `session_id` que não começa por `cs_` → 400 sem chamar o Stripe.
- [ ] **Passo 2:** correr → FAIL.
- [ ] **Passo 3:** função; página: `mensagem(codigo, loja)` produz a frase exata dos Global Constraints (sem `Store: …` se a loja não chegar em 2,5 s, para o WhatsApp abrir aos 3 s). Texto da página: lead `Your purchase code is PD-XXXXXX. WhatsApp opens in a moment with your message ready.` + parágrafo novo `You'll get access to your member area as soon as Click confirms you're a client (usually the same day).` Remover "The assistant replies in Portuguese" e a frase de "To change niche, message us on WhatsApp" (as preferências estão na área).
- [ ] **Passo 4:** testes PASS; captura 1280 e 375 em `docs/screenshots/click-plano/`.
- [ ] **Passo 5:** commit `feat(click): loja na mensagem de WhatsApp e acesso à área`.

### Tarefa R4: página de administração Validate / Reject & refund

**Files:**
- Create: `admin.html`, `admin.js`, `supabase/functions/admin-click/index.ts`, `supabase/functions/admin-click/acoes.ts` + `acoes.test.ts`
- Modify: `supabase/functions/_shared/email.ts` (dois moldes novos)

**Interfaces:**
- Consumes: `estado_click`, `loja`, `codigo_compra`, `subscricoes.stripe_subscription_id`.
- Produces: `POST /functions/v1/admin-click` com JWT do utilizador; aceite só se o e-mail do JWT for igual ao secret `ADMIN_EMAIL` (senão 403). Corpo `{"acao":"listar"}` → pendentes `[ {email,nome,telefone,loja,codigo_compra,criado_em} ]`; `{"acao":"validar","email"}`; `{"acao":"recusar","email"}`. Funções puras em `acoes.ts`: `decidirReembolso(fatura: { amount_paid: number; payment_intent: string | null }): { reembolsar: boolean; payment_intent: string | null }`.

- [ ] **Passo 1: testes** `acoes.test.ts`: fatura de 1500 com `pi_x` → `{reembolsar:true, payment_intent:"pi_x"}`; fatura de 0 → `{reembolsar:false}`; `validar` em quem não está `pendente` → 409 sem e-mail; `recusar` duas vezes → a segunda 409 e nenhum reembolso; JWT com outro e-mail → 403.
- [ ] **Passo 2:** correr → FAIL.
- [ ] **Passo 3:** `validar`: `estado_click='validado'` (update com `.eq('estado_click','pendente')`, que é o que torna a ação idempotente) e envia o e-mail de boas-vindas existente (`tentarBoasVindas`). `recusar`: mesmo update condicional para `'recusado'`, depois reembolso da última fatura paga (`decidirReembolso`) e `subscriptions.cancel` imediato; e-mail ao cliente, assunto `About your ProvenDrop × Click plan`, corpo exato: `Click couldn't confirm you as a client, so we've refunded your payment in full. You can still join the ProvenDrop Platform plan at provendrop.com.` Página: login normal (magic link), tabela dos pendentes com os dois botões; `Reject & refund` pede confirmação na própria página (sem `window.confirm`). `admin.html` com `noindex`, fora do menu.
- [ ] **Passo 4:** PASS; secret `ADMIN_EMAIL` documentado em `docs/SETUP.md` e pedido pelo `setup-supabase.ps1`.
- [ ] **Passo 5:** commit `feat(admin): validar ou recusar compras Click`.

### Tarefa R5: área de membros — acesso Click pendente e clareza do plano

**Files:**
- Modify: `app.js` (`temAcesso`, `CAMPOS`, `semAcesso`, `renderConta`, cabeçalho), `app.html`

**Interfaces:**
- Consumes: `estado_click` (R1).

- [ ] **Passo 1: testes** (Playwright, Supabase simulado por `route`): Click `pendente` → título `Your Click access is being confirmed` e texto `Usually the same day. You'll get an e-mail as soon as Click confirms you're a client.`; Click `recusado` → `Your Click plan was not confirmed` + link para o plano Platform; Click `validado` → entra na área; topo mostra `Plan: ProvenDrop × Click — member area + daily list in the Click WhatsApp group`; direto mostra `Plan: ProvenDrop Platform — member area + daily e-mail`; 1.ª entrada Click mostra a caixa `Everything you get on WhatsApp is here too — plus all past collections, the launch kits and filters.` e, depois de fechada, não volta (localStorage com try/catch).
- [ ] **Passo 2:** correr → FAIL.
- [ ] **Passo 3:** implementar; Subscription do Click acrescenta `The WhatsApp group is managed by Click. Your access ends when you cancel.`; remover o texto antigo "Click customers receive the collections in the Click WhatsApp group, not in this area."
- [ ] **Passo 4:** PASS; capturas 1280 e 375.
- [ ] **Passo 5:** commit `feat(app): plano Click com acesso à área`.

### Tarefa R6: site público — dois planos lado a lado

**Files:**
- Modify: `index.html` (secção de planos), `config.js` (`STRIPE_LINK_CLICK` preenchido com `https://buy.stripe.com/9B6eVe5BpgCyfdEaDQ4gg01`)

- [ ] **Passo 1: teste** Playwright: a 1280 os dois cartões estão na mesma linha; a 375 empilham; o cartão Click tem o título `ProvenDrop × Click — for Click Dynamics clients`, `€15/month · no joining fee` e a nota `After purchase, Click confirms you're a client and adds you to the WhatsApp group.`; o botão abre o link Click; o cartão Platform mostra `€40 first month, then €15/month`.
- [ ] **Passo 2:** FAIL → **Passo 3:** implementar → **Passo 4:** PASS + capturas → **Passo 5:** commit `feat(site): planos Platform e Click lado a lado`.

### Tarefa R7: links curtos `/c/<id>`

**Files:**
- Create: `404.html`
- Modify: `app.js` (ler `?c=`, guardar durante o login, abrir a coleção)

**Interfaces:**
- Consumes: `feed_dia.id_curto` (R1, escrito por V2). Formato: `^[A-HJ-NP-Z2-9]{6}$`.

- [ ] **Passo 1: testes** Playwright: `/c/7F3K9Q` → redireciona para `/app.html?c=7F3K9Q`; sem sessão → login → depois do magic link volta à coleção (o `c` sobrevive ao redirect: guardar em `sessionStorage` com try/catch e também no `redirectTo`); com sessão → abre o cartão da coleção mais recente com esse `id_curto` (`order dia desc limit 1`); id inexistente ou `retirada=true` → Library com `This collection is no longer available.`; `/c/abc` (formato inválido) → `app.html` sem parâmetro; qualquer outro caminho desconhecido → página 404 normal.
- [ ] **Passo 2:** FAIL → **Passo 3:** implementar → **Passo 4:** PASS → **Passo 5:** commit `feat(app): links curtos /c/<id> para as coleções`.

---

## Parte V — Rotina (Claude, vault `Product Research/_dados/`)

### Tarefa V1: `publicar_feed.py` — `id_curto` e mensagem em inglês

**Files:**
- Modify: `_dados/publicar_feed.py` (`item()`, `texto()`, nova `id_curto()`)
- Create: `_dados/tests/test_publicar_feed.py`

**Interfaces:**
- Produces: `id_curto(link: str) -> str` — normaliza (minúsculas, `http`→`https`, sem `www.`, sem query/fragmento, sem `/` final), SHA-256 UTF-8, primeiros 6 bytes `% 32` no alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (o mesmo de `codigo.ts`); `item()` ganha `"id_curto"`; `texto(dia, itens) -> str` no formato da secção 6 do desenho. Constantes `PAISES_EN` (CA Canada, DE Germany, FR France, ES Spain, IT Italy, GB United Kingdom, US United States, NL Netherlands, CH Switzerland, PT Portugal, BE Belgium, AT Austria, IE Ireland, PL Poland, SE Sweden, DK Denmark) e `NICHOS_EN` (Roupa Feminina → Women's fashion, Roupa Masculina → Men's fashion, House Decor → Home decor, Joalharia → Jewellery).

- [ ] **Passo 1: testes:**
  - `id_curto("https://x.com/collections/a")` == `id_curto("HTTP://www.X.com/collections/a/?utm=1#t")`; resultado casa `^[A-HJ-NP-Z2-9]{6}$`
  - `texto("2026-11-09", [])` == `"*ProvenDrop · 9 Nov*\nNo new confirmed collections today. More tomorrow."`
  - com 2 itens (aprovada IT 25/19/268000; a observar GB 14/4/sem alcance): 1.ª linha `*ProvenDrop · 9 Nov*`, 2.ª `2 collections today`, contém `🟢 *Cappotti Boho da Uomo 2* · Italy`, `Men's fashion · 25 ads · 19 days · 268k people reached`, `👉 provendrop.com/c/<id>`, `_(under observation)_`, última linha `📚 All past collections, kits and filters: provendrop.com/app`; 1 item → `1 collection today`
  - estados: `nova` → `_(new · confirmation tomorrow)_`; `continua a bater` → `_(still running · sent before)_`
  - alcance 1 250 000 → `1.3M people reached`
  - `sem_pt`: nenhum texto gerado casa `\b(anúncios|dias|pessoas|Hoje|observar|coleç)\w*`; não contém o link da loja nem `Zip`
  - nicho `Pets` (sem tradução) → linha de métricas começa em `N ads`; país `XX` → aparece `XX`
- [ ] **Passo 2:** `python3 -m pytest _dados/tests/test_publicar_feed.py -v` → FAIL.
- [ ] **Passo 3:** implementar. Mês em inglês por lista fixa (não depende do locale). Os campos que o bot lê (coluna M, zip) não mudam.
- [ ] **Passo 4:** PASS; gerar `--texto` para o feed de hoje e confirmar à vista.
- [ ] **Passo 5:** commit no vault (`expectedMtimeMs`, sem `force`) + backup `_dados/_backup/publicar_feed_2026-11-08.py`.

### Tarefa V2: `publicar_plataforma.py` envia `id_curto`

**Files:**
- Modify: `_dados/publicar_plataforma.py` (`linha_feed`)
- Test: `_dados/tests/test_publicar_plataforma.py`

**Interfaces:**
- Consumes: `id_curto()` de V1 (import de `publicar_feed`); coluna de R1.

- [ ] **Passo 1: teste:** `linha_feed(dia, 1, it, None)["id_curto"] == id_curto(it["link"])`; item sem `id_curto` no feed antigo → calculado a partir do link.
- [ ] **Passo 2:** FAIL → **Passo 3:** implementar → **Passo 4:** PASS + `--dry-run` mostra `id_curto` nas linhas.
- [ ] **Passo 5:** commit no vault. Não correr sem `--dry-run` antes de R1 estar aplicada (a coluna tem de existir).

### Tarefa V3: regra nova em `passos_extra.md` (secção AF)
- [ ] Escrever: mensagem do bot em inglês gerada por `publicar_feed.py` (não editar à mão); `id_curto` vai no feed e em `feed_dia`; se aparecer nicho ou país novo, acrescentar a tradução a `NICHOS_EN`/`PAISES_EN` no mesmo dia; cada compra Click pendente aparece no alerta e valida-se em `provendrop.com/admin.html`.
- [ ] Commit no vault.

---

## Parte A — Afonso

### A1: Stripe, link Click (antes do teste)
- [ ] Links de pagamento → "ProvenDrop via Click" → Editar → **Campos personalizados** → Adicionar → Texto, etiqueta `Your store name (as registered with Click)`, "Marcar como opcional" desligado (o Stripe não pede chave).
- [ ] Confirmar **Recolher números de telefone** ligado.
- [ ] Supabase → Edge Functions → Secrets: `ADMIN_EMAIL` = o teu e-mail.

### A2: teste completo (com um código de teste de uso único, criado no Stripe)
- [ ] Compra Click: o código é igual na página, no WhatsApp e no e-mail de alerta; a mensagem traz `Store:`; login mostra "being confirmed".
- [ ] `admin.html` → Validate → recebes o e-mail de acesso e entras na área.
- [ ] 2.ª compra → Reject & refund → cancelada no Stripe e e-mail recebido.
- [ ] Abrir um link `provendrop.com/c/…` da mensagem do dia, com e sem sessão.
- [ ] Cancelar as subscrições de teste.

### A3: mensagem à Click (depois do teste)
- [ ] Enviar a mensagem do processo novo (a Claude escreve, curta, em português).

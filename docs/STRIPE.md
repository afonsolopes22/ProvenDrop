# Stripe: configuração em modo real (desde 2026-11-06)

Conta Stripe do ProvenDrop, **modo real**, ativada a 2026-11-05/06. Tudo o que está nesta página já foi criado no painel do Stripe e **não deve ser criado outra vez**. Os identificadores abaixo são públicos; as chaves `sk_live_` e `whsec_` nunca entram em ficheiros, commits, mensagens ou no vault: ficam só no Stripe e em `supabase secrets` (via `scripts\setup-supabase.ps1`).

Rótulos dos menus: o Dashboard do Stripe em português (Europa). Entre parênteses, o rótulo em inglês quando ajuda.

## O que existe (modo real)

| O quê | Identificador | Onde se usa |
|---|---|---|
| Produto **ProvenDrop Direct**, 15 €/mês | `price_1UYaVjJPREpzETp6wboEOplv` | segredo `STRIPE_PRICE_DIRETO` (valor por omissão do `setup-supabase.ps1`) |
| Produto **ProvenDrop via Click**, 15 €/mês | `price_1UYaWLJPREpzETp6beErOUxC` | segredo `STRIPE_PRICE_CLICK` (valor por omissão do `setup-supabase.ps1`) |
| Produto **Adesão ProvenDrop**, 25 € uma vez, **só no link Direct** | `price_1UYaXiJPREpzETp6GoaPRcuA` (produto `prod_VZk1TG0Nv8evG3`) | só no Stripe |
| Payment Link **Direct** (Direct + Adesão: 40 € no 1.º mês, depois 15 €/mês) | `https://buy.stripe.com/7sYaEYd3Rcmid5w6nA4gg00` | `config.js` → `STRIPE_LINK_DIRECT` |
| Payment Link **via Click** (só ProvenDrop via Click, 15 €/mês, **sem adesão**) | `https://buy.stripe.com/9B6eVe5BpgCyfdEaDQ4gg01` | só a Click o usa; nunca aparece no site |
| Portal de cliente | `https://billing.stripe.com/p/login/7sYaEYd3Rcmid5w6nA4gg00` | `config.js` → `STRIPE_PORTAL_LINK` |
| Webhook `provendrop-supabase` | `we_1UYavbJPREpzETp6L1Gn66lh` → `https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/stripe-webhook` | segredo `STRIPE_WEBHOOK_SECRET` (o `whsec_` deste endpoint) |
| Payment Link **Direct de regresso** (só mensalidade, para ex-membros) | **ainda não existe em modo real** | `config.js` → `STRIPE_LINK_RETURN` fica vazio; a área mostra o Subscribe normal a ex-membros até existir |

Categoria fiscal dos três produtos: General – Services (`txcd_20030000`). Stripe Tax ("Recolher impostos automaticamente") **desligado** nos links até decisão do contabilista.

**Decisão de 2026-11-06 (adesão só no Direct):** quem entra pela Click paga só 15 €/mês; a adesão de 25 € é cobrada apenas no link Direct, na primeira fatura. O webhook não distingue adesão (a origem vem da metadata `origem` ou do `price_`), por isso não precisou de alteração; o site, `bem-vindo-click.html` e os documentos dizem "No joining fee" para a porta Click.

**Modo da função (S1/M11):** o webhook só aceita eventos do modo para que foi configurado. Com `sk_live_` o `setup-supabase.ps1` põe `STRIPE_ACCEPT_TEST=0` e só entram eventos `livemode=true`; eventos de teste recebem 200 vazio e um aviso no log.

## a) Payment Link Direct: confirmar

**Links de pagamento** (Payment Links) → abre o link `7sYaEY…`:
- **Produtos**: ProvenDrop Direct 15,00 €/mês **+** Adesão ProvenDrop 25,00 € (o Stripe junta um preço único a uma subscrição: no 1.º pagamento cobra 40 €, depois 15 €/mês).
- **Opções**: recolhe o e-mail (sempre); códigos promocionais: ver no painel (M6: cupões com limite de utilizações e duração `once`).
- **Metadados** (Metadata): `origem` = `direto`. (Se o campo faltar, o webhook reconhece pelo `price_` de `STRIPE_PRICE_DIRETO`.)
- **Depois do pagamento** → redirecionar para `https://afonsolopes22.github.io/ProvenDrop/bem-vindo.html` (mudar para o domínio próprio quando existir, DOMINIO.md).

## b) Payment Link via Click: confirmar

**Links de pagamento** → link `9B6eVe…`:
- **Produtos**: só ProvenDrop via Click 15,00 €/mês. **Sem** adesão.
- **Opções**: e-mail e **telefone** obrigatório (para a Click juntar ao grupo); sem códigos promocionais.
- **Metadados**: `origem` = `click`.
- **Depois do pagamento** → `https://afonsolopes22.github.io/ProvenDrop/bem-vindo-click.html`.

Quem paga por este link fica em `subscricoes`/`subscritores` com `origem = click` e o estado da subscrição (para a comissão), **sem login e sem acesso** à área (RLS).

## c) Portal de cliente: confirmar

**Definições** (engrenagem) → **Faturação** (Billing) → **Portal do cliente** (Customer portal):
- Link de entrada ativo: `https://billing.stripe.com/p/login/7sYaEY…` → `config.js` → `STRIPE_PORTAL_LINK`.
- Funcionalidades: **cancelar subscrição** no fim do período (com motivo), **atualizar método de pagamento**, nome/morada/telefone, histórico de faturas. **E-mail não editável** (M4: o login da área usa o e-mail do pagamento). Sem mudança de plano. Regressa a `app.html`.

O cliente entra no portal com o e-mail com que pagou; o Stripe envia-lhe um link de acesso. Cancelar no portal → `customer.subscription.updated` com `cancel_at_period_end = true` (continua `ativo` até ao fim do mês pago, `acesso_fim` preenchido) e, no fim, `customer.subscription.deleted` → `cancelado`.

## d) Webhook: confirmar

**Programadores** (Developers) → **Webhooks** → destino `provendrop-supabase` (`we_1UYavb…`):
- **URL**: `https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/stripe-webhook`
- **Versão da API**: **2026-10-28.endive**. A função lê os campos nas duas formas (antiga e nova): `invoice.subscription` **ou** `invoice.parent.subscription_details.subscription`; `line.price.id` **ou** `line.pricing.price_details.price`; `current_period_end` na subscrição **ou** em `items.data[0]`; `origem` na metadata da sessão de checkout ou da subscrição, com fallback pelo `price_id`. Testes com fixtures das duas versões em `supabase/functions/stripe-webhook/compat.test.ts`.
- **Eventos** (6): `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Em falta face ao endpoint de teste (A4): `charge.dispute.created` e `charge.refunded`. **Acrescentá-los à mão** no painel (⋯ → Atualizar detalhes → Eventos): sem eles, uma disputa não bloqueia o acesso nem alerta.
- Formato: **Snapshot** (objetos completos; a função não lê eventos *thin*).
- Até a função ter novo deploy com o `whsec_` real, as entregas aparecem como falhadas em **Tentativas de entrega**; o Stripe volta a tentar durante 3 dias. Depois do deploy, fazer um pagamento real novo (não reenviar eventos antigos: PAGAMENTOS.md C1/A2).

## e) Os dois segredos: só para o setup-supabase.ps1

1. **STRIPE_SECRET_KEY**: **Programadores** → **Chaves de API** (API keys) → **Chave secreta** → **Revelar chave real** → `sk_live_…`.
2. **STRIPE_WEBHOOK_SECRET**: **Programadores** → **Webhooks** → `provendrop-supabase` → **Segredo de assinatura** (Signing secret) → **Revelar** → `whsec_…`.

Cola-os só quando o `scripts\setup-supabase.ps1` os pedir (`Read-Host -AsSecureString`, sem eco, sem ficar no histórico nem no repositório). Se um deles for exposto: **Chaves de API → Reverter** (Roll key) e **Webhooks → ⋯ → Reverter segredo** (Roll secret), e correr o script outra vez.

## Onde fica cada valor

| Valor | `config.js` (público) | `supabase secrets` |
|---|---|---|
| URL do Payment Link Direct | `STRIPE_LINK_DIRECT` | — |
| URL do portal | `STRIPE_PORTAL_LINK` | — |
| URL do link de regresso (quando existir) | `STRIPE_LINK_RETURN` | — |
| `price_` Direct / Click | — | `STRIPE_PRICE_DIRETO` / `STRIPE_PRICE_CLICK` |
| `plink_` Direct (opcional) | — | `STRIPE_PAYMENT_LINK_DIRETO` |
| `sk_live_` | **nunca** | `STRIPE_SECRET_KEY` |
| `whsec_` | **nunca** | `STRIPE_WEBHOOK_SECRET` |

## O que o webhook faz com cada evento (migração 0004)

O estado **nunca** é copiado do evento: em todos os casos a função relê a subscrição com `stripe.subscriptions.retrieve` e escreve o estado atual (C1/M2/M3/B1). Cada subscrição é uma linha em `public.subscricoes`; `public.subscritores.origem/estado` são derivados (a melhor subscrição direto manda; um evento click nunca retira acesso a uma direto — C2/S3).

| Evento | Efeito |
|---|---|
| `checkout.session.completed` (pago) | Sincroniza a subscrição da sessão. Origem: metadata do link → price_id → payment link. Alerta se o e-mail ficar com duas subscrições a cobrar. |
| `customer.subscription.created` / `updated` / `deleted` | Sincroniza: `ativo` (active/trialing), `em_atraso` (past_due/unpaid; guarda `em_atraso_desde`), `incompleto` (incomplete: sem login nem e-mail), `cancelado` (canceled/paused/incomplete_expired). `cancel_at_period_end` → `acesso_fim` (B4). |
| `invoice.paid` / `invoice.payment_failed` | Sincroniza a subscrição da fatura (relida no Stripe). |
| `charge.dispute.created` | Bloqueia o acesso de todos os subscritores desse cliente (`bloqueado_em`) e envia alerta com o prazo de resposta (A4). |
| `charge.refunded` | Só alerta (pode ser parcial ou de boa vontade); cancelar à mão no Stripe se for caso disso. |

Acesso (`public.tem_acesso`): origem direto, não bloqueado, `ativo` **ou** `em_atraso` há menos de **7 dias** (M1). Depois disso a área mostra "Payment overdue" e o e-mail diário deixa de sair; `invoice.paid` repõe tudo.

Boas-vindas (A3): só a quem tem acesso, com reserva atómica (`reservar_boas_vindas`), link por `token_hash`, marcadas só depois de o Resend aceitar; um varrimento pg_cron de 15 em 15 min repete as que faltam até 5 tentativas e depois alerta. Quem regressa (cancelado → ativo) recebe "Welcome back".

Idempotência (A1/A2): `stripe_eventos` nunca é apagada; repetido já concluído → 200; repetido em curso há < 5 min → 503; em curso há mais tempo → reprocessa. Sem `STRIPE_WEBHOOK_SECRET` a função devolve 500 a tudo; com assinatura inválida, 400. Logs e respostas não contêm e-mails nem erros internos (B5/S13).

Comissão da Click: `select * from public.subscricoes where origem = 'click'`.

## Nome que aparece no Checkout

Em modo real o Checkout, o portal, os recibos e as faturas mostram o **Nome público da empresa** de **Definições → Dados públicos** (Settings → Public details). Confirmar que está `ProvenDrop` e que o e-mail de apoio e o site estão preenchidos.

## Por fazer (à mão, no painel ou no terminal)

- [ ] Correr `scripts\setup-supabase.ps1` com `sk_live_` e o `whsec_` do endpoint real (os `price_` reais já são os valores por omissão). No fim o script volta a fazer deploy do `stripe-webhook` com `--no-verify-jwt`.
- [ ] Acrescentar `charge.dispute.created` e `charge.refunded` ao endpoint `provendrop-supabase` (A4).
- [ ] Criar o Payment Link **Direct de regresso** em modo real (só o preço mensal Direct; metadata `origem=direto`, `tipo=regresso`; → `bem-vindo.html`; sem códigos) e pôr o URL em `config.js` → `STRIPE_LINK_RETURN`. O `scripts\stripe-teste.ps1` só trabalha em modo de teste.
- [ ] Teste real (TESTE.md §7): pagar o Direct (40 €), ver a linha, entrar por magic link, descarregar o kit, cancelar no portal, perder o acesso, reembolsar; pelo link Click confirmar `origem = click`, sem acesso e sem adesão.
- [ ] Termos / privacidade / reembolsos publicados; links em **Dados públicos**; "Exigir termos de serviço" nos 2 links.
- [ ] Quando houver domínio: redirecionamentos dos 2 links e do portal, `APP_URL`, Redirect URLs do Supabase (DOMINIO.md).

## Histórico: modo de teste (2026-11-02 → 2026-11-06)

O fluxo todo foi construído e testado primeiro em modo de teste (área restrita "Área restrita de ProvenDrop"): produtos `ProvenDrop Direct` / `ProvenDrop via Click` / `Adesão ProvenDrop` (então nos **dois** links), dois Payment Links, link de regresso criado pelo `scripts\stripe-teste.ps1`, portal e webhook `we_1UX9VN…` com 8 eventos e API `2024-12-18.acacia`. Resultados em TESTE.md §0–§6. Os ids e URLs de teste ficaram na nota do vault "Stripe — modo de teste (IDs e links)"; não estão no repositório. Para voltar a testar em modo de teste: `config.local.js` (só `localhost`) com os links de teste, e `setup-supabase.ps1` com `sk_test_` (que põe `STRIPE_ACCEPT_TEST=1`). Os clientes e subscrições de teste não passam para o modo real; os dados de teste foram apagados antes da passagem (TESTE.md §5).

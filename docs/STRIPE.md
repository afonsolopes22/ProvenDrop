# Stripe: o que já existe em modo de teste, como confirmar, e como repetir no modo real

Conta Stripe `acct_1UQscOJMAlqVy4dK`, **modo de teste**. Tudo o que está nesta página já foi criado (2026-11-02) e **não deve ser criado outra vez**: produtos, links e webhook novos só no modo real, com aprovação explícita. Os identificadores abaixo são públicos; as chaves `sk_` e `whsec_` nunca entram em ficheiros, commits ou mensagens.

Rótulos dos menus: o Dashboard do Stripe em português (Europa). Entre parênteses, o rótulo em inglês quando ajuda.

## O que existe

| O quê | Identificador | Onde se usa |
|---|---|---|
| Produto **ProvenDrop Direct**, 15 €/mês | `prod_VYFz5Sh2acJSKc` · `price_1UX9ThJMAlqVy4dKYnrmwGb3` | segredo `STRIPE_PRICE_DIRETO` |
| Produto **ProvenDrop via Click**, 15 €/mês | `prod_VYG0mJkH0A457H` · `price_1UX9UYJMAlqVy4dK2FZi3k9w` | segredo `STRIPE_PRICE_CLICK` |
| Produto **Adesão ProvenDrop**, 25 € uma vez (nos dois links) | `prod_VYG0gDziJ4fFAJ` · `price_1UX9UOJMAlqVy4dKxdL2r2wj` | só no Stripe |
| Payment Link **Direct** | `plink_1UX9UkJMAlqVy4dKAXTumtyZ` · `https://buy.stripe.com/test_cNidRaaV4gWv1Cy7mhfbq00` | `config.js` → `STRIPE_LINK_DIRECT`; segredo `STRIPE_PAYMENT_LINK_DIRETO` |
| Payment Link **via Click** (o que a Click envia aos clientes dela) | `plink_1UX9UxJMAlqVy4dKAbyhkQk7` · `https://buy.stripe.com/test_9B64gA2oygWv0yu7mhfbq01` | só a Click o usa |
| Portal de cliente | configuração `bpc_1UX9V9JMAlqVy4dKReL66kNG` · `https://billing.stripe.com/p/login/test_cNidRaaV4gWv1Cy7mhfbq00` | `config.js` → `STRIPE_PORTAL_LINK` |
| Webhook | `we_1UX9VNJMAlqVy4dKeelqzvJL` → `https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/stripe-webhook` | segredo `STRIPE_WEBHOOK_SECRET` (o `whsec_` deste endpoint) |

`config.js` e `scripts/setup-supabase.ps1` já trazem estes valores (o script propõe-nos e Enter aceita). Faltam só os dois segredos, que copias tu (secção e).

## a) Produto "ProvenDrop Direct" e o seu Payment Link: confirmar

**Catálogo de produtos** (Product catalog) → **ProvenDrop Direct**:
- Preço **15,00 € / mês**, recorrente (Recurring, Monthly). O **ID da API** (`price_1UX9Th…`) aparece ao lado do preço, com o ícone de copiar.
- Produto **Adesão ProvenDrop**: preço único **25,00 €** (`price_1UX9UO…`).

**Links de pagamento** (Payment Links) → abre o link `test_cNidRa…`:
- **Produtos**: ProvenDrop Direct 15,00 €/mês **+** Adesão ProvenDrop 25,00 € (o Stripe junta um preço único a uma subscrição: no 1.º pagamento cobra 40 €, depois 15 €/mês).
- **Opções**: recolhe o e-mail (sempre); códigos promocionais permitidos; sem telefone.
- **Metadados** (Metadata): `origem` = `direto`. (Se um dia o campo não aparecer no editor, o webhook reconhece na mesma pelo `price_` de `STRIPE_PRICE_DIRETO`.)
- **Depois do pagamento** (After the payment) → **Não mostrar a página de confirmação** → redirecionar para `https://afonsolopes22.github.io/ProvenDrop/bem-vindo.html`.
- O URL do link está em `config.js` → `STRIPE_LINK_DIRECT`; o id `plink_…` fica em `STRIPE_PAYMENT_LINK_DIRETO`.

## b) Payment Link da Click: confirmar

**Links de pagamento** → link `test_9B64gA…`:
- **Produtos**: ProvenDrop via Click 15,00 €/mês + Adesão 25,00 €.
- **Opções**: e-mail e **telefone** (para a Click juntar ao grupo).
- **Metadados**: `origem` = `click`.
- **Depois do pagamento** → redirecionar para `https://afonsolopes22.github.io/ProvenDrop/bem-vindo-click.html` (a página só existe online depois do merge do PR #1; até lá o redirecionamento dá 404 — é esperado).

Quem paga por este link fica em `subscritores` com `origem = click` e o estado da subscrição (para a comissão), **sem login e sem acesso** à área (RLS).

## c) Portal de cliente: confirmar

**Definições** (engrenagem) → **Faturação** (Billing) → **Portal do cliente** (Customer portal):
- Link de entrada activo: `https://billing.stripe.com/p/login/test_cNidRa…` → `config.js` → `STRIPE_PORTAL_LINK`.
- Funcionalidades: **cancelar subscrição** (no fim do período), **actualizar método de pagamento**, **histórico de faturas**, actualizar e-mail e morada. Sem mudança de plano. Regressa a `app.html`.

O cliente entra no portal com o e-mail com que pagou; o Stripe envia-lhe um link de acesso. Cancelar no portal → `customer.subscription.updated` com `cancel_at_period_end = true` (continua `ativo` até ao fim do mês pago) e, no fim, `customer.subscription.deleted` → `cancelado`.

## d) Webhook: confirmar

**Programadores** (Developers) → **Webhooks** → endpoint `we_1UX9VN…`:
- **URL**: `https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/stripe-webhook`
- **Eventos** (6): `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
- Formato: **Snapshot** (objectos completos; a função não lê eventos *thin*).
- Até a função ter deploy (`scripts/setup-supabase.ps1`), as entregas aparecem como falhadas em **Tentativas de entrega**; o Stripe volta a tentar durante 3 dias em modo real e algumas horas em teste. Depois do deploy, **Reenviar** (Resend) os eventos falhados, ou simplesmente fazer um pagamento de teste novo.

## e) Os dois segredos: copiar para o setup-supabase.ps1

1. **STRIPE_SECRET_KEY**: **Programadores** → **Chaves de API** (API keys) → **Chave secreta** (Secret key) → **Revelar chave de teste** → `sk_test_…`.
2. **STRIPE_WEBHOOK_SECRET**: **Programadores** → **Webhooks** → endpoint `we_1UX9VN…` → **Segredo de assinatura** (Signing secret) → **Revelar** → `whsec_…`.

Cola-os só quando o `scripts\setup-supabase.ps1` os pedir (sem eco). Se um deles for exposto: **Chaves de API → Reverter** (Roll key) e **Webhooks → ⋯ → Reverter segredo** (Roll secret), e correr o script outra vez.

## Onde fica cada valor

| Valor | `config.js` (público) | `supabase secrets` |
|---|---|---|
| URL do Payment Link Direct | `STRIPE_LINK_DIRECT` | — |
| URL do portal | `STRIPE_PORTAL_LINK` | — |
| `price_` Direct / Click | — | `STRIPE_PRICE_DIRETO` / `STRIPE_PRICE_CLICK` |
| `plink_` Direct | — | `STRIPE_PAYMENT_LINK_DIRETO` |
| `sk_test_` | **nunca** | `STRIPE_SECRET_KEY` |
| `whsec_` | **nunca** | `STRIPE_WEBHOOK_SECRET` |

## O que o webhook faz com cada evento

| Evento | Efeito em `public.subscritores` |
|---|---|
| `checkout.session.completed` (pago) | Cria/actualiza a linha pelo e-mail. Origem: metadata → price_id → payment link. **Direto**: cria o utilizador de Auth, gera o magic link e envia o e-mail de boas-vindas (uma única vez). **Click**: só regista. |
| `customer.subscription.created` | Se a linha ainda não existe (evento chegou primeiro), cria-a com o e-mail do cliente Stripe; senão só alinha o estado. |
| `customer.subscription.updated` | `estado` = ativo / em_atraso / cancelado conforme `status`. |
| `customer.subscription.deleted` | `estado = cancelado` → a área mostra "Subscription cancelled" e as consultas devolvem 0 linhas (RLS). |
| `invoice.paid` | Quem estava `em_atraso` volta a `ativo`. |
| `invoice.payment_failed` | `ativo` → `em_atraso` (a área pede para actualizar o cartão). |

Cada `evt_…` é processado uma vez (tabela `stripe_eventos`); se a função falhar, liberta o id e o Stripe volta a tentar. Sem `STRIPE_WEBHOOK_SECRET` configurado a função devolve 500 a tudo; com assinatura inválida, 400.

## Modo real (só com aprovação explícita)

Com o interruptor **Modo de teste** desligado, repetir exactamente a estrutura de teste:

1. **Catálogo de produtos → + Adicionar produto**: `ProvenDrop Direct` (15,00 € / mês, recorrente), `ProvenDrop via Click` (15,00 € / mês) e `Adesão ProvenDrop` (25,00 €, único). Anotar os três `price_…` reais.
2. **Links de pagamento → + Novo**: link Direct (Direct + Adesão; e-mail; metadados `origem=direto`; depois do pagamento → `https://provendrop.com/bem-vindo.html` quando o domínio estiver activo, senão o URL do GitHub Pages) e link via Click (via Click + Adesão; e-mail + telefone; `origem=click`; → `bem-vindo-click.html`). Entregar o link via Click à Click.
3. **Definições → Faturação → Portal do cliente**: mesmas opções; **Activar link**; copiar o link real.
4. **Programadores → Webhooks → + Adicionar destino/endpoint**: mesmo URL da função, os mesmos 6 eventos, formato Snapshot; revelar o novo `whsec_`.
5. **Programadores → Chaves de API**: `sk_live_…`.
6. Correr `scripts\setup-supabase.ps1` com os valores reais (o script recusa `sk_live_` combinado com os `price_` de teste, e pede confirmação "SIM").
7. `config.js`: `STRIPE_LINK_DIRECT` e `STRIPE_PORTAL_LINK` reais; commit; publicar.
8. Guardar os ids reais numa nota do vault igual à de teste (sem chaves).

Os clientes e subscrições de teste não passam para o modo real.

# Revisão de pagamentos

Revisão de 2026-11-02 ao ramo `plataforma-direto` (PR #1), no commit `c5b4281`. Só leitura: sem alterações de código e sem chamadas ao Stripe ou ao Supabase.

**Limites:** os cenários foram analisados só pela leitura do código; o que depende do comportamento do Stripe ou do Supabase Auth e não foi observado está marcado **[confirmar em teste]**.

**Veredito (à data da revisão):** não passar a modo real ainda. O caminho feliz funciona (teste de 2/11) e a base está bem feita. Faltam 5 correções de código (ordem 1 a 5) e os bloqueadores do Afonso. O problema de fundo é que o webhook escreve o estado que vem na fotografia do evento, sem verificar se ainda é o atual, e guarda uma só subscrição por e-mail.

O estado de cada achado depois das correções está na secção **Estado dos achados** no fim.

## O que está bem (não mexer)

- Assinatura verificada sobre o corpo em bruto; sem segredo nada é aceite.
- Âmbito PCI mínimo: Payment Links alojados, nenhum dado de cartão passa pelo servidor.
- RLS falha fechado: só direto + ativo lê conteúdo.
- Origem desconhecida fica click, sem acesso.
- E-mails sempre em minúsculas, com check na tabela.
- O upsert preserva `nichos`, `paises`, `boas_vindas_em` e `user_id`.
- Nenhum valor monetário é guardado.

## A correção das boas-vindas (fdcca13) chega?

Resolve o bug de 2/11, mas não chega: (1) quase não há "evento seguinte" (só `checkout.session.completed` e `customer.subscription.created`, com segundos de diferença; a falha do Resend devolve 200, o Stripe não repete); (2) corrida: os dois eventos podem ler `boas_vindas_em = null` ao mesmo tempo e enviar dois e-mails, e cada `generateLink` pode invalidar o anterior **[confirmar em teste]**; (3) envia a quem ainda não pagou (`incomplete` → "Your access is active"); (4) quem regressa não recebe nada.

Correção completa: reserva atómica (`update … where boas_vindas_em is null and tentativa antiga returning`), envio só com acesso ativo, varrimento por pg_cron de 15 em 15 min com limite de tentativas e alerta, e-mail de regresso quando cancelado → ativo.

**⚠️ Antes de reenviar eventos (TESTE.md 1.3):** o reenvio do `customer.subscription.created` falhado traria a fotografia antiga (`active`) e voltaria a pôr o subscritor cancelado como ativo (achado C1 ao vivo). Usar um pagamento de teste novo.

## Achados por gravidade

Ficheiro por omissão: `supabase/functions/stripe-webhook/index.ts`.

### Crítico

| ID | Onde | Problema | Consequência |
|---|---|---|---|
| C1 | `:112, :274, :259, :292-297` | Estado escrito a partir da fotografia do evento, sem reler o Stripe nem comparar datas. O checkout escreve sempre `ativo`. | Cancelado com acesso grátis (um `updated(active)`, `created` ou checkout atrasado depois do `deleted` deixa ativo para sempre). Pagante bloqueado (um `created(incomplete)` ou `updated(past_due)` atrasado deixa `em_atraso` até haver outro evento). |
| C2 | `:203-211`, `0001:22-25` | Uma linha por e-mail, com um só `origem`/`customer`/`subscription`, e nada impede segunda subscrição. | Direct e depois Click: origem passa a click e o cliente perde o acesso continuando a pagar as duas. Click e depois Direct: a comissão da Click desaparece do registo. Direct duas vezes: a primeira fica órfã e continua a cobrar. Nada avisa. |

### Alto

| ID | Onde | Problema | Consequência |
|---|---|---|---|
| A1 | `:95-99, :125-128` | O id é gravado antes do trabalho. Se a função morrer antes do catch, ou o delete falhar, o evento perde-se em silêncio; o inverso também: um evento repetido enquanto o primeiro corre recebe 200. | Evento perdido. |
| A2 | `:97, :127` | Apagar o id não duplica efeitos graves (handlers quase idempotentes), mas reprocessar tarde faz a fotografia antiga sobrepor o estado novo. | Agrava C1. |
| A3 | ver secção anterior | Boas-vindas sem retentativa real. | Pagante sem acesso nem aviso. |
| A4 | webhook sem esses eventos | `charge.dispute.created` e `charge.refunded` não são tratados. | Com disputa, o cliente recupera os 40 € e mantém o acesso. O prazo de resposta passa sem alerta. |
| A5 | `docs/TESTE.md §2` | O caminho Click nunca foi testado, e é dele que depende a comissão. | Primeiro erro apareceria com clientes reais. |
| A6 | `setup-supabase.ps1:89-93, :104` | Enter aceita os valores de teste propostos; o guarda só atua se a chave `sk_live_` for escrita nessa corrida; só verifica o preço Direct. | Depois de ir para real, mudar o `EMAIL_FROM` pode repor `price_`/`plink_` de teste em silêncio. |
| A7 | `docs/TESTE.md:79` | "ou deixá-los" está errado: a base é a mesma em teste e em real. | Linhas de teste mantêm acesso em modo real. |
| A8 | `docs/EMAIL.md`, `docs/DOMINIO.md` | Domínio por comprar: `onboarding@resend.dev` só entrega ao e-mail da conta. | Em real, nenhum cliente recebe boas-vindas. Bloqueador. |
| A9 | `index.html`, `bem-vindo.html` | O site promete oferecer outra combinação ou reembolsar se nicho/país estiver cheio, mas não há limite de vagas no código. | Promessa sem processo. |

### Médio

| ID | Onde | Problema |
|---|---|---|
| M1 | `:311-317, :286`, `app.html` | Acesso cortado à primeira falha, com o Stripe ainda a tentar. Decisão: período de tolerância. |
| M2 | `:302-309, :311-317` | `invoice.*` age pelo cliente e não pela subscrição, sem reler o estado. |
| M3 | `:274, :284-285, :324` | `incomplete` vira `em_atraso`: quem abandona o 3DS recebe "access is active". |
| M4 | portal com e-mail editável | Cliente muda de e-mail no portal: a linha e o Auth ficam no antigo. Solução simples: desligar a edição de e-mail no portal. |
| M5 | `:148-153` | Erro da API ao listar linhas é tratado como "sem preços". Deve lançar erro. |
| M6 | `docs/STRIPE.md` | Códigos promocionais permitidos; um código 100 % forever partilhado dá acesso grátis permanente. |
| M7 | `0001:19-32` | Sem registo de pagamentos e sem reconciliação. Precisa de verificação diária Stripe ↔ base, com alerta. |
| M8 | `index.html` | Quem cancela e volta paga novamente 25 €. Decisão do Afonso. |
| M9 | sem código de aviso | Com pagamento falhado, o acesso e o e-mail diário param sem aviso do ProvenDrop. |
| M10 | `:159, :253` | `checkout.session.async_payment_succeeded/failed` não são tratados. Só importa com métodos diferidos. |
| M11 | sem verificação de `livemode` | Evento de um modo não é confrontado com a chave do outro. |

### Baixo

| ID | Onde | Problema |
|---|---|---|
| B1 | `:296` | Fallback por cliente: evento de outra subscrição do mesmo cliente sobrepõe estado. |
| B2 | `:306-308, :314-315` | Zero linhas atualizadas não deixa rasto. |
| B3 | `:238-248` | O reenvio manual diz "Your access is active" mesmo a cancelados. Compara o segredo sem tempo constante. |
| B4 | app sem campo | A área não mostra a data de fim quando `cancel_at_period_end`. |
| B5 | `:231`, `_shared/email.ts:30` | E-mails de clientes nos logs. |
| B6 | `:42` | API fixada em `2024-12-18.acacia`; criar o endpoint real com a mesma. |
| B7 | `config.js` | Preços do site mantidos à mão, separados do Stripe. |
| B8 | docs | Documentação desatualizada. |
| B9 | raiz | Ficheiro vazio `32`, não versionado. |
| B10 | Auth | Confirmar "Allow new users to sign up" desligado. |

## Mapeamento de estados

| Status Stripe | Estado | Avaliação |
|---|---|---|
| active, trialing | ativo | ✅ |
| past_due | em_atraso | tolerância de 7 dias (decisão) |
| unpaid | em_atraso | ✅ |
| incomplete | incompleto | sem boas-vindas, texto próprio (M3) |
| incomplete_expired, canceled, paused | cancelado | ✅ |
| cancel_at_period_end | ativo até ao fim | ✅ (B4: mostrar data) |

Reembolso e disputa: `charge.dispute.created` corta o acesso e alerta com o prazo; `charge.refunded` só alerta (pode ser parcial ou de boa vontade).

## Cenários (análise de código)

| # | Cenário | Esperado | Atual (c5b4281) | Achado |
|---|---|---|---|---|
| 1 | created(active) → checkout | 1 linha, 1 e-mail | ✅ | |
| 2 | checkout → created(active) | igual | ✅ | |
| 3 | checkout e created em paralelo | 1 linha, 1 e-mail | ❌ 2 e-mails, possível link morto | A3 |
| 4 | created(incomplete) → updated(active) | sem e-mail até pagar | ❌ e-mail antes do pagamento | M3 |
| 5 | updated(active), checkout, depois created(incomplete) atrasado | ativo | ❌ em_atraso | C1 |
| 6 | invoice.paid antes de tudo | sem perda | ✅ (sem rasto) | B2 |
| 7 | invoice.paid, depois created(incomplete) | ativo | ❌ em_atraso | C1 |
| 8 | Reenvio de evento já concluído | ignorado | ✅ | |
| 9 | Evento falhado reenviado dias depois | sem efeito antigo | ❌ fotografia antiga sobrepõe | C1, A2 |
| 10 | Função morre a meio | reprocessa | ❌ evento perdido | A1 |
| 11 | deleted seguido de updated(active) atrasado | cancelado | ❌ ativo para sempre | C1 |
| 12 | Falha de pagamento e depois pago | em_atraso → ativo | ✅ na ordem certa; ❌ invertido | M2 |
| 13 | Cancelamento no portal | ativo até ao fim, depois cancelado | ✅ | |
| 14 | Direct → Click, mesmo e-mail | mantém acesso, regista as duas | ❌ perde acesso | C2 |
| 15 | Click → Direct, mesmo e-mail | dá acesso, mantém comissão | ⚠️ comissão perdida | C2 |
| 16 | Direct duas vezes | bloqueado ou alertado | ❌ cobra duas, sem aviso | C2 |
| 17 | Mudança de e-mail no portal | linha acompanha | ❌ | M4 |
| 18 | E-mail com maiúsculas | mesma linha | ✅ | |
| 19 | Link Click para obter acesso Direct | sem acesso | ✅; ⚠️ retira acesso a um Direct existente | C2 |
| 20 | Metadata forjada pelo cliente | impossível | ✅ | |
| 21 | Código promocional 100 % | conforme a duração do cupão | ⚠️ | M6 |
| 22 | Regresso após cancelar | acesso + e-mail | ⚠️ sem e-mail; paga adesão de novo | M8 |
| 23 | Disputa | corta e alerta | ❌ | A4 |
| 24 | Reembolso total | alerta; cancelar à mão | ❌ | A4, A9 |

## Dinheiro

- Adesão de 25 €: **só no link Direct**, na primeira fatura da subscrição (total 40 €); repete-se em cada novo checkout Direct (M8). Decisão de 2026-11-06: o link **via Click** cobra só 15 €/mês, **sem adesão** (o produto Adesão não está nesse link). O webhook e a base não distinguem adesão (a origem vem da metadata ou do `price_`), por isso nada mudou no código: o site, `bem-vindo-click.html` e STRIPE.md dizem "No joining fee" para a porta Click.
- Moeda: só EUR; o código não guarda valores. Confirmar se o Adaptive Pricing está desligado.
- A validar com o contabilista: Stripe Tax e preços com/sem IVA; faturas; vendas B2C a outros países; recolha de morada e NIF.
- Por publicar: termos, política de reembolso, privacidade e consentimento do direito de livre resolução. `CONTACT_EMAIL` vazio.

## Passagem a modo real

Pré-requisito: correções feitas e `TESTE.md` todo verde, incluindo a secção 2. A lista item a item está em `docs/STRIPE.md` ("Modo real").

## O que o Afonso tem de fazer no Stripe

Agora, em modo de teste: não reenviar o `created` antigo (fazer um pagamento novo); executar a secção 2 do TESTE.md; desligar a edição de e-mail no portal (M4); confirmar que os cupões têm limite de utilizações e duração `once`, e desligar códigos promocionais no link Click; confirmar se só cartão está ativo (M10) e o Adaptive Pricing; ver se "limitar a uma subscrição por cliente" nos Payment Links se aplica.

Antes de passar a real: recuperação de receita (retentativas e estado final); e-mails do Stripe de pagamento falhado, cartão a expirar e recibos; dados públicos (nome, e-mail de apoio, site); domínio verificado no Resend; IVA/faturas com o contabilista; termos, reembolso e privacidade; criar os objetos reais e desativar o endpoint de teste.

## Estado dos achados (2026-11-02, depois das correções no ramo `plataforma-direto`)

| ID | Estado | Onde / como |
|---|---|---|
| C1 | ✅ corrigido | `sincronizarSubscricao`: todos os handlers relêem a subscrição com `stripe.subscriptions.retrieve`; o checkout já não escreve `ativo` fixo. |
| C2 | ✅ corrigido | Tabela `subscricoes` (uma linha por `stripe_subscription_id`); `subscritores.origem/estado` derivados por `recalcular_subscritor`; alerta quando o mesmo e-mail tem duas subscrições ativas/em atraso; comissão Click lida de `subscricoes`. |
| A1/A2 | ✅ corrigido | `stripe_eventos.processado_em` + `tentativas`; nunca apagado; concluído → 200, em curso < 5 min → 503, em curso antigo → reprocessa. |
| A3 | ✅ corrigido | `reservar_boas_vindas` (atómica), envio só com acesso, marca só após o Resend aceitar, varrimento pg_cron de 15 min (`?varrer_boas_vindas=1`), 5 tentativas → alerta; e-mail de regresso quando cancelado → ativo. |
| A4 | ✅ corrigido | `charge.dispute.created` → `bloqueado_em` + alerta com prazo; `charge.refunded` **total** → `bloqueado_em` (motivo `reembolso ch_…`) + alerta (2026-11-06); parcial → só alerta. Eventos acrescentados ao endpoint pelo `scripts\stripe-teste.ps1` (a correr pelo Afonso). |
| A5 | ⏳ Afonso | Secção 2 do TESTE.md. |
| A6 | ✅ corrigido | `setup-supabase.ps1`: sem valores de teste por omissão; Enter = não alterar; recusa misturas teste/real (ids, links em `config.js`, `EMAIL_FROM`). |
| A7 | ✅ corrigido | TESTE.md §5: apagar sempre os dados de teste. |
| A8 | ⏳ Afonso | Comprar e verificar `provendrop.com` (DOMINIO.md). |
| A9 | ✅ corrigido | Promessa de vagas/reembolso retirada de `index.html`, `bem-vindo.html` e `bem-vindo-click.html` (decisão: retirar). |
| M1 | ✅ corrigido | Tolerância de 7 dias (`em_atraso_desde`) em `tem_acesso`/`membro_ativo_direto`, `email-diario` e `app.js` (dias que faltam). |
| M2/M3/B1 | ✅ corrigido | Estado relido; `incomplete` → `incompleto`, sem login nem e-mail, texto próprio na área; sem fallback por cliente. |
| M4 | ⏳ Afonso | Desligar a edição de e-mail no portal. |
| M5 | ✅ corrigido | `precosDaSessao` lança o erro (o Stripe repete). |
| M6 | ⏳ Afonso | Cupões com limite e `once`; sem códigos no link Click (o link de regresso já nasce sem códigos). |
| M7 | ✅ corrigido | Função `reconciliar` (só leitura) + pg_cron diário 06:30 UTC + alerta. |
| M8 | ✅ corrigido | Link de regresso só com mensalidade (`STRIPE_LINK_RETURN`), mostrado a ex-membros; site diz "joining fee with your first subscription". |
| M9 | ⚠️ parcial | A área mostra o aviso e os dias que faltam; não há e-mail próprio de pagamento falhado (depende dos e-mails do Stripe, a activar). |
| M10 | ⏳ Afonso | Confirmar só cartão. |
| M11 | ✅ corrigido | Ver S1. |
| B2 | ✅ corrigido | `invoice.*` sem subscrição e zero linhas ficam no log (`console.warn`). |
| B3 | ✅ corrigido | Reenvio manual só a quem tem acesso (409 para os outros); segredo em tempo constante. |
| B4 | ✅ corrigido | `acesso_fim` (cancel_at / fim do período) mostrado na área. |
| B5 | ✅ corrigido | Sem e-mails nos logs (`idEmail`), nem no erro do Resend. |
| B6 | 📝 documentado | STRIPE.md, modo real: criar o endpoint com a API `2024-12-18.acacia`. |
| B7 | — | Mantido (preços em `config.js`, confirmados à mão). |
| B8 | ✅ corrigido | STRIPE.md, SETUP.md, EMAIL.md, README, TESTE.md actualizados. |
| B9 | ✅ corrigido | Ficheiro `32` apagado e ignorado. |
| B10 | ⏳ Afonso | Ver S4. |

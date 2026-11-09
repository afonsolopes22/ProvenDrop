---
data: 2026-11-08
tags: [provendrop, spec]
estado: para revisão do Afonso
---
# ProvenDrop × Click: plano de parceria com acesso à plataforma (desenho)

## 1. Objetivo
Os clientes da Click Dynamics (agência de anúncios, Lisboa) recebem hoje só uma mensagem de WhatsApp por dia, feia, com 3-4 coleções e sem acesso às antigas. O objetivo é dar-lhes o produto completo (área de membros, Library, kits, Preferences) mantendo o grupo de WhatsApp como aviso diário, sem duplicar trabalho e sem que o desconto de parceria seja usado por quem não é cliente da Click.

Sucesso:
- um cliente Click consegue, no mesmo dia em que paga, entrar na área de membros e ver as coleções antigas e os kits;
- quem não é cliente da Click não fica com o plano Click (é reembolsado);
- qualquer pessoa percebe no site e na app a diferença entre os dois planos.

## 2. Decisões já tomadas (Afonso, 2026-11-08)
- Caminho 1: mesmo produto, duas entradas. **Os dois planos estão no site público, lado a lado.**
- O plano Click inclui a plataforma + o grupo de WhatsApp. Aceita-se que a maioria escolha o Click (opção A).
- O desconto (sem adesão) é um agradecimento à Click pela parceria; só vale para clientes da Click Dynamics.
- Quem confirma o pagamento é o Afonso; quem valida que a pessoa é cliente e a põe no grupo é a Click.
- Não-cliente que compre o plano Click → **reembolso total** e cancelamento.
- Todo o texto visível ao cliente (site, app, mensagens de WhatsApp, kits) é **em inglês**.

## 3. Planos

| | ProvenDrop Platform | ProvenDrop × Click |
|---|---|---|
| Para quem | Qualquer pessoa | Clientes da Click Dynamics |
| Inclui | Área de membros: lista diária, Library, kits, Preferences, e-mail diário | O mesmo + lista diária no grupo de WhatsApp da Click |
| Preço | €40 no 1.º mês (adesão €25 + €15), depois €15/mês | €15/mês, sem adesão |
| Validação | Automática (pagamento) | Pagamento (Afonso) + cliente da Click (Click) |

## 4. Fluxo de compra Click
1. **Site:** cartão "ProvenDrop × Click — for Click Dynamics clients" com a nota "After purchase, Click confirms you're a client and adds you to the WhatsApp group."
2. **Checkout Stripe (link Click):** telefone obrigatório + campo personalizado obrigatório "Your store / company name (as registered with Click)".
3. **Página bem-vindo-click:** "Payment confirmed", código `PD-XXXXXX` (já existe), abre o WhatsApp da Click (+351 920 414 823) ao fim de 3 s com:
   "Hi! I've just paid for the ProvenDrop Click plan. Purchase code: PD-XXXXXX. Store: <nome>. I'd like access to the WhatsApp bot."
   Explica também: "You'll get access to your member area as soon as Click confirms you're a client (usually the same day)."
4. **Webhook (origem=click):** guarda em `subscritores` código, telefone, nome, loja, `estado_click = 'pendente'`; e-mail "New Click subscription" só para o Afonso (ALERT_EMAIL) com nome, telefone, e-mail, loja e código.
5. **Afonso:** confirma o pagamento e diz à Click "PD-XXXXXX paid".
6. **Click:** confirma que é cliente e adiciona ao grupo; diz ao Afonso "PD-XXXXXX ok" ou "PD-XXXXXX not a client".
7. **Afonso marca o resultado** numa página de administração simples (só para o e-mail do Afonso): lista de compras Click pendentes com dois botões:
   - **Validate** → `estado_click = 'validado'`, envia ao cliente o e-mail de acesso à área de membros;
   - **Reject & refund** → reembolso total + cancelamento da subscrição no Stripe, `estado_click = 'recusado'`, e-mail ao cliente: "Click couldn't confirm you as a client, so we've refunded your payment in full. You can still join the ProvenDrop Platform plan at provendrop.com."
8. **Acesso à área de membros:** cliente Click só entra com `estado_click = 'validado'`. Enquanto `pendente`, o login mostra "Your Click access is being confirmed (usually the same day)."
9. **Cancelamento** (pelo portal do Stripe): o Afonso recebe o aviso e diz à Click para tirar a pessoa do grupo.

## 5. Clareza na app
- **Topo da área de membros:** "Plan: ProvenDrop × Click — member area + daily list in the Click WhatsApp group" ou "Plan: ProvenDrop Platform — member area + daily e-mail".
- **Subscription:** o que inclui, preço, como cancelar; no Click: "The WhatsApp group is managed by Click. Your access ends when you cancel."
- **1.ª entrada de um cliente Click:** caixa que se pode fechar: "Everything you get on WhatsApp is here too — plus all past collections, the launch kits and filters."

## 6. Mensagem diária do WhatsApp (gerada pela rotina, `publicar_feed.py`)
Em inglês, curta, com link curto para a coleção na área de membros:

```
*ProvenDrop · 9 Nov*
3 collections today

🟢 *Cappotti Boho da Uomo 2* · Italy
Men's fashion · 25 ads · 19 days · 268k people reached
👉 provendrop.com/c/7F3K9Q

🟡 *Turtlenecks* · United Kingdom _(under observation)_
Women's fashion · 14 ads · 4 days
👉 provendrop.com/c/2M8X1D

📚 All past collections, kits and filters: provendrop.com/app
```

- Sem o link da loja concorrente nem o link do Drive no texto (o bot continua a anexar o zip a partir da coluna M; o kit está na área).
- Sem coleções novas: "No new confirmed collections today. More tomorrow."
- `/c/<id>`: página nova que, depois do login, abre a coleção na área de membros. O `<id>` é estável por coleção (ex.: 6 caracteres derivados do link_colecao) e vai no feed (`id_curto`) e em `feed_dia`.
- Os comandos do bot (`/pr hoje`…) são da Click: tradução para inglês é pedido à parte.

## 7. Quem faz o quê
- **Claude Code (repositório):** cartão Click e nota (secção 4.1), página bem-vindo-click (4.3), webhook e coluna `estado_click` (4.4), página de administração com Validate / Reject & refund (4.7), bloqueio de acesso Click pendente (4.8), clareza na app (5), página `/c/<id>` e coluna `id_curto` em `feed_dia` (6).
- **Rotina (vault, Claude):** `publicar_feed.py` com a mensagem nova em inglês e o campo `id_curto`; `publicar_plataforma.py` a enviar `id_curto`; regra nova nos `passos_extra`.
- **Afonso:** campo personalizado e telefone obrigatório no link Click do Stripe; validar/recusar na página de administração; enviar à Click a mensagem do novo processo.
- **Click:** validar clientes e gerir o grupo.

## 8. Fora do âmbito
- Bot com comandos novos ou em inglês (depende da Click).
- WhatsApp para clientes Platform (pode vir como extra pago).
- Validação automática com a Click (API ou lista partilhada).

## 9. Testes
- Compra Click com TESTE100: código igual na página, no WhatsApp e no e-mail; linha `pendente`; login mostra "being confirmed"; Validate → acesso; outra compra → Reject & refund → reembolso visível no Stripe e e-mail enviado.
- Mensagem diária gerada pela rotina num dia de teste: links `/c/<id>` abrem a coleção certa depois do login; sem login pedem login e voltam à coleção.
- Capturas a 1280 e 375; sem português no texto visível ao cliente.

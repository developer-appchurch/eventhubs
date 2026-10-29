# Pagamentos (Fase 4)

Status: **implementado, nunca testado contra o Mercado Pago real.** Faltam as credenciais do aplicativo e uma conta de teste (veja "Como habilitar"). Sem essa configuração, ingressos pagos aparecem como "Pagamento online indisponível" e nada finge estar conectado.

## Decisões

| Decisão | Escolha | Quem decidiu |
| --- | --- | --- |
| Gateway | Mercado Pago, Checkout Pro | Junio (26/10/2026) |
| Recebedor | Cada organização, na própria conta Mercado Pago (OAuth) | Junio (26/10/2026) |
| Taxa do EventHub | `marketplace_fee`, retida pelo Mercado Pago no pagamento e enviada à conta dona do aplicativo | Junio (26/10/2026) |
| Valor da taxa | `PLATFORM_FEE_BPS` (pontos-base; 500 = 5%). Padrão 0 | **pendente**: valor e quem paga (participante ou organização) |
| Boleto | Excluído do checkout: compensa em dias e a reserva dura 30 minutos | padrão técnico, reversível |
| Reembolso | Manual, pelo painel do Mercado Pago da organização. O EventHub registra o resultado pelo webhook | padrão técnico; reembolso automático exige política explícita |

## O que diz a documentação oficial (consultada em 26/10/2026)

- **Marketplace:** cada vendedor autoriza o aplicativo via OAuth; o checkout é criado com o `access_token` do vendedor e o campo `marketplace_fee` em `/checkout/preferences`. A tarifa do Mercado Pago é descontada do vendedor e a comissão do marketplace sai do restante. Em reembolso, o valor é debitado do vendedor e do marketplace na proporção de cada um. [Integrar marketplace](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace)
- **OAuth:** `https://auth.mercadopago.com/authorization` e `POST https://api.mercadopago.com/oauth/token`; código vale 10 minutos; access token vale 180 dias; PKCE suportado (precisa ser ativado no aplicativo); renovação exige o escopo `offline_access`. [OAuth](https://mercadopago.com.br/developers/en/docs/oauth/creation), [renovação](https://mercadopago.com.br/developers/en/docs/oauth/renewal)
- **Webhooks:** cabeçalho `x-signature` (`ts=…,v1=…`) e `x-request-id`; resposta 200/201 em até 22 s, senão há novas tentativas (0, 15, 30 min, 6, 48, 96 h…). O manifesto assinado (`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, HMAC-SHA256) foi conferido no SDK oficial `mercadopago@3.6.1` (`WebhookSignatureValidator`). [Notificações](https://mercadopago.com.br/developers/es/docs/checkout-pro/payment-notifications)

**Incertezas que precisam de conferência na conta real:**
- Tarifas: a página oficial de tarifas não foi lida. Os valores públicos encontrados (Pix 0,99%, cartão 4,99% na hora / 3,99% em 30 dias, boleto R$ 3,49) vêm de um artigo de 2023 e **não** devem ser usados como verdade.
- A documentação do marketplace não diz se Pix é aceito no Checkout Pro de marketplace, e não define com clareza a unidade de `marketplace_fee` (os exemplos indicam valor em reais; a implementação envia em reais).
- O retorno documentado do refresh tem divergência de `grant_type` (`refresh_token` × `refresh-token`); a implementação usa `refresh_token`.

## Fluxo

1. **Conectar:** owner/admin clica em "Conectar conta Mercado Pago" em Configurações. O servidor gera `state` e PKCE (cookie httpOnly de 10 min), o Mercado Pago devolve em `/app/payments/mercadopago/callback`, o servidor confere `state`, sessão e papel, troca o código e grava os tokens **cifrados** (AES-256-GCM com `PAYMENT_TOKEN_KEY`) em `private.payment_accounts`, fora da Data API.
2. **Reservar:** `register_for_event` cria a inscrição em `pending_payment` com `expires_at = now() + 30 min`, sob a mesma trava do evento da Fase 3. A reserva conta na capacidade até vencer.
3. **Checkout:** o servidor cria a preferência com o token do vendedor, preço vindo do banco, `external_reference` = id da inscrição, `marketplace_fee`, validade igual à reserva, e redireciona o participante. Falha no Mercado Pago não perde a inscrição: a página dela tem "Pagar com Mercado Pago" para tentar de novo.
4. **Webhook** (`POST /api/v1/webhooks/mercadopago`): valida a assinatura, registra a notificação (`payment_events`, não reprocessa a mesma `x-request-id` já concluída), consulta o pagamento no Mercado Pago com o token do vendedor e chama `record_payment`.
5. **`record_payment`** (só `service_role`), sob a trava do evento:
   - vendedor do pagamento diferente do vendedor do checkout → recusado (`SELLER_MISMATCH`);
   - referência desconhecida → recusado (`UNKNOWN_REFERENCE`), notificação encerrada;
   - valor ou moeda diferentes do preço gravado → não confirma, marca `amount_mismatch`;
   - aprovado com reserva válida → confirma;
   - **aprovado depois de a reserva vencer:** confirma só se ainda houver vaga (capacidade global e limite do ingresso) e o e-mail não tiver outra inscrição ativa; senão marca `paid_without_seat` e **não** confirma. A organização reembolsa pelo Mercado Pago;
   - segundo pagamento aprovado da mesma inscrição → `duplicate_payment`; pago após cancelamento → `paid_after_cancellation`;
   - reembolso ou chargeback do pagamento que confirmou → inscrição `refunded`;
   - um estado em andamento nunca sobrescreve um estado final (notificações processadas fora de ordem).
6. **Painel:** aba "Pagamentos" do evento (owner, admin, gestor de eventos e visualizador de relatórios; o operador de check-in não vê) lista valores brutos, taxa e o que exige ação.

Estado da inscrição e estado financeiro são separados: `registrations.status` diz se a pessoa tem vaga; `payments.status` diz o que o Mercado Pago informou.

## Como habilitar

1. No [painel de desenvolvedores do Mercado Pago](https://www.mercadopago.com.br/developers/panel/app), com a conta que vai **receber a taxa do EventHub**, crie um aplicativo (Checkout Pro, modelo marketplace).
2. No aplicativo: Redirect URL = `https://<domínio>/app/payments/mercadopago/callback`; ative "authorization code com PKCE"; inclua o escopo `offline_access`.
3. Em Webhooks: URL `https://<domínio>/api/v1/webhooks/mercadopago`, evento **Pagamentos**; copie a chave secreta.
4. Na Vercel (somente servidor, nunca `NEXT_PUBLIC_`): `SUPABASE_SECRET_KEY`, `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_WEBHOOK_SECRET`, `PAYMENT_TOKEN_KEY` (`openssl rand -base64 32`; trocar esta chave invalida as contas já conectadas) e, se houver taxa, `PLATFORM_FEE_BPS`.
5. Homologação: crie usuários de teste no painel, conecte a conta do vendedor de teste a uma organização, publique um evento com ingresso pago e pague com o comprador de teste. Confira a inscrição confirmada, a aba Pagamentos e a taxa no painel do vendedor e do marketplace.

O webhook precisa de URL pública com HTTPS: em `localhost` o checkout abre, mas a confirmação não chega.

## Limitações conhecidas

- Sem reembolso pelo EventHub; sem cancelamento de inscrição pelo organizador (fase seguinte).
- Sem desconectar a conta. Reconectar com **outra** conta Mercado Pago deixa sem consulta os pagamentos pendentes da conta anterior.
- Um ingresso por inscrição (quantidade por pedido não é usada).
- Confirmado o pagamento, sai o mesmo e-mail com o QR Code da inscrição gratuita (se o e-mail estiver configurado). Não há e-mail de "pagamento pendente" nem de reembolso.

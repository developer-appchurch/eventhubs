# Deploy

Status: projeto Vercel `eventhubs` criado (team `dev-0c56`), com previews automáticos a cada PR. Confirme no painel se já há deploy de produção e qual plano está contratado.

## Preparação

1. Crie o projeto Supabase próprio e aplique as migrations (`docs/configuracao.md`).
2. Projeto Vercel conectado ao repositório `eventhubs` (já criado).
3. Configure as variáveis de ambiente em **Preview** e **Production** separadamente, usando os projetos Supabase correspondentes. Nunca reutilize a produção no preview.
4. Adicione os domínios de preview e produção nas Redirect URLs do Supabase Auth.

## Build

- Comando: `npm run build` (framework Next.js, Node 22).
- Verificações antes de publicar: `npm run verify`.
- O build não lê variáveis de ambiente; a validação acontece na inicialização e em cada requisição.

## Tetos de gasto e proteção (painel; alerta sozinho não desliga nada)

Nada disto é configurável por código. Confira antes do lançamento e marque aqui quando feito.

**Vercel**
- [ ] Plano adequado ao uso comercial (Hobby não permite). Team > Settings > Billing.
- [ ] **Spend Management** ligado, com valor máximo e a opção de pausar o projeto ao atingir o limite.
- [ ] Projeto > **Firewall**: Bot Protection ligada e regras de **Rate Limit** (ex.: `/login`, `/cadastro`, `/api/*`). O Attack Challenge Mode fica à mão para ataques.
- [ ] Variáveis de **Production** conferidas, incluindo `SUPABASE_SECRET_KEY` (sem ela, o limite por IP do app fica desligado; o teto por evento no banco funciona sempre).

**Supabase**
- [ ] **Spend Cap** ligado (Organization > Billing).
- [ ] Authentication > Rate Limits revisados; Attack Protection com CAPTCHA (Turnstile).
- [ ] Authentication: **Prevent use of leaked passwords** ligado.
- [ ] Project Settings > API > Exposed schemas: apenas `public` (nunca `private`).

**Resend / Mercado Pago**
- [ ] Limite diário e mensal do plano do Resend conferido.
- [ ] Webhook do Mercado Pago só com o tópico de pagamentos.

### O que o código já limita
- Banco: 120 inscrições por minuto por evento (trigger em `registrations`).
- App: limite por IP em login, cadastro, reset de senha, criação de organização e inscrição (`src/lib/rate-limit.ts`; falha aberta se o contador não responder).
- `maxDuration` de 30 s nas rotas; chamadas externas (Mercado Pago, Resend) com timeout de 10 s.
- E-mail de confirmação: no máximo 5 tentativas por inscrição.
- Capas: arquivo WebP de até 1 MiB; capas substituídas permanecem no bucket por causa de eventos duplicados.

## Verificação pós-deploy

1. `GET /` responde 200.
2. `GET /app` sem sessão redireciona para `/login?next=/app`.
3. Cadastro envia e-mail de confirmação com link que aponta para o domínio correto.
4. Após confirmar, onboarding cria a organização e leva ao painel.
5. Com uma segunda conta, o slug da primeira organização responde 404.

## Rollback

- **Aplicação:** promova o deployment anterior no painel da Vercel.
- **Banco:** migrations são aditivas nesta fase. Não há rollback automático; qualquer reversão exige nova migration corretiva revisada, nunca edição de migration já aplicada.

## Domínio

Domínio próprio ainda não definido. O exemplo `eventhubs.com.br` na especificação é ilustrativo e não está registrado.

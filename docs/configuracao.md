# Configuração

## 1. Projeto Supabase próprio

Crie um projeto exclusivo para o EventHub (não reutilize outro produto). Anote:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable key** (`sb_publishable_...`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Não copie a chave secreta para o `.env`.

## 2. Aplicar migrations

```bash
supabase link --project-ref <ref>
supabase db push
```

Antes de aplicar em um projeto com dados, revise o SQL e faça backup. Ver `docs/operacao.md`.

## 3. Autenticação (Supabase Auth)

Em **Authentication → URL Configuration**:

- **Site URL:** a URL pública (ex.: `https://app.exemplo.com.br`).
- **Redirect URLs:** adicione `${NEXT_PUBLIC_APP_URL}/auth/confirm`, `${NEXT_PUBLIC_APP_URL}/auth/callback` e os equivalentes de desenvolvimento (`http://localhost:3000/...`).

Em **Authentication → Providers → Email**: habilite e-mail com senha. A confirmação de e-mail é recomendada.

### E-mails de confirmação e recuperação

O app funciona com os **modelos de e-mail padrão** do Supabase (que só podem ser editados com SMTP próprio). O link do e-mail passa pelo Supabase e volta ao app em `/auth/callback?code=...`, onde o código é trocado por sessão (fluxo PKCE).

Para isso funcionar, em **Redirect URLs** inclua um curinga do domínio, porque o link carrega `?next=`:

- `https://<dominio-do-app>/**` (por exemplo, o domínio do preview) e `http://localhost:3000/**`

Limitações do fluxo padrão:

- O link precisa ser aberto **no mesmo navegador** em que o cadastro ou o pedido de recuperação foi feito (o verificador PKCE fica em cookie). Em outro navegador ou aparelho, o login mostra "O link expirou".
- O serviço de e-mail padrão do Supabase tem limite baixo de envios por hora e é indicado só para desenvolvimento.

Com SMTP próprio, é possível trocar para o fluxo por `token_hash` (independe do navegador): edite os modelos para `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding` (cadastro) e `...&type=recovery&next=/reset-password` (recuperação) e volte as chamadas em `src/modules/auth/actions.ts` para `/auth/confirm`. A rota `/auth/confirm` continua disponível para isso.

### Login com Google (opcional)

1. No Google Cloud Console, crie um cliente OAuth (tipo aplicativo da Web).
2. URI de redirecionamento autorizada: `https://<ref>.supabase.co/auth/v1/callback`.
3. No Supabase, em **Authentication → Providers → Google**, habilite e informe o Client ID e o Client Secret.
4. O botão "Continuar com Google" já está na tela de login. Enquanto o provedor não estiver habilitado, o clique retorna à tela de login com erro.

**Não testado nesta fase** porque não há projeto Supabase conectado.

## 4. Variáveis de ambiente

Veja `.env.example`. Para desenvolvimento, `NEXT_PUBLIC_APP_URL=http://localhost:3000`.

Mensagens de erro de configuração citam apenas os nomes das variáveis, nunca os valores.

## 5. Banco local para testes

```bash
# Use um PostgreSQL 16 local (ou a Supabase CLI com Docker).
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres npm run db:reset:local
TEST_DATABASE_URL=... npm run test:db
```

O script de reset recusa hosts que não sejam loopback.

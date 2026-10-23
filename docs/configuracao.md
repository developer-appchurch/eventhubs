# Configuração

## 1. Projeto Supabase próprio

Crie um projeto exclusivo para o EventHubs (não reutilize outro produto). Anote:

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

Em **Authentication → Email Templates**, use o token do link de confirmação e de recuperação apontando para a aplicação:

- Confirmação: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding`
- Recuperação de senha: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

Use o `NEXT_PUBLIC_APP_URL` correto no lugar de `{{ .SiteURL }}` se o Site URL for diferente.

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

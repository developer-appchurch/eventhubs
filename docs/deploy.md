# Deploy

Status: **não publicado**. Nenhum projeto Vercel foi criado nesta fase, e nenhuma publicação de produção foi autorizada.

## Preparação

1. Crie o projeto Supabase próprio e aplique as migrations (`docs/configuracao.md`).
2. Crie o projeto Vercel a partir do repositório `eventhubs` (quando houver remoto autorizado).
3. Configure as variáveis de ambiente em **Preview** e **Production** separadamente, usando os projetos Supabase correspondentes. Nunca reutilize a produção no preview.
4. Adicione os domínios de preview e produção nas Redirect URLs do Supabase Auth.

## Build

- Comando: `npm run build` (framework Next.js, Node 22).
- Verificações antes de publicar: `npm run verify`.
- O build não lê variáveis de ambiente; a validação acontece na inicialização e em cada requisição.

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

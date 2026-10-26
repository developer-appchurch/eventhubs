# EventHubs

Plataforma independente para criar eventos, receber inscrições, gerenciar participantes e acompanhar a presença. Multi-organização, com isolamento de dados garantido pelo banco (Row Level Security).

> **Status (Fases 1 a 6):** fundação, eventos, formulários, ingressos, inscrições gratuitas com capacidade global, banco de perguntas, check-in por QR Code ou manual, e-mail de confirmação com o QR Code (Resend, opcional), presença, exportação CSV e relatório do evento (inscrições, presença, ingressos, financeiro e confirmações por dia) estão implementados e testados localmente. Pagamentos pelo Mercado Pago (Fase 4, modelo marketplace) estão implementados e testados no banco local, mas ainda não contra o Mercado Pago real (veja [docs/pagamentos.md](docs/pagamentos.md)). Veja [Limitações conhecidas](#limitações-conhecidas).

## Stack

- Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript estrito
- Supabase Auth e PostgreSQL com RLS, via `@supabase/ssr` e `@supabase/supabase-js`
- Tailwind CSS v4, validação com Zod 4
- Vitest (unitários e testes de segurança contra PostgreSQL real)
- Vercel para hospedagem (ainda não conectada)

## Pré-requisitos

- Node.js 22 LTS ou superior
- PostgreSQL 16+ local para testes de banco (ou Supabase CLI com Docker)
- Um projeto Supabase próprio do EventHubs (para executar a aplicação completa)

## Como instalar

```bash
npm install
cp .env.example .env.local   # preencha as variáveis (veja docs/configuracao.md)
```

## Como executar localmente

```bash
npm run dev          # http://localhost:3000
```

Sem as variáveis `NEXT_PUBLIC_*`, a página inicial funciona, mas rotas privadas respondem 503 e o servidor registra quais variáveis faltam (somente nomes).

## Banco de dados

As migrations ficam em `supabase/migrations/` e são aplicadas em ordem.

- **Supabase remoto:** `supabase link --project-ref <ref>` e depois `supabase db push`. Nenhuma migration foi aplicada a um projeto remoto nesta fase.
- **Banco local de testes:** `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres npm run db:reset:local`. O script recusa hosts que não sejam loopback, pois apaga e recria os schemas.

## Testes

```bash
npm test              # unitários: slug, redirecionamentos seguros, env, mapeamento de erros
npm run test:db       # isolamento, RLS, grants e funções (exige TEST_DATABASE_URL)
npm run lint
npm run typecheck
npm run build
npm run verify        # tudo acima, em sequência
```

Os testes de banco usam transações com `set local role` e `request.jwt.claims`, o mesmo mecanismo do Supabase, e fazem rollback ao final. Um teste de mutação confirmou que remover uma política RLS faz os testes de isolamento falharem.

## Deploy

Veja [docs/deploy.md](docs/deploy.md).

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Modelo de dados](docs/modelo-de-dados.md)
- [Políticas RLS](docs/rls.md)
- [Segurança e privacidade](docs/seguranca.md)
- [Configuração (Supabase, Auth, variáveis)](docs/configuracao.md)
- [Deploy](docs/deploy.md)
- [Operação e diagnóstico](docs/operacao.md)

## Variáveis de ambiente

| Nome | Uso | Onde |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | URL pública, para e-mails e redirecionamentos | Servidor e navegador |
| `NEXT_PUBLIC_SUPABASE_URL` | API do projeto Supabase | Servidor e navegador |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publicável (respeita RLS) | Servidor e navegador |
| `TEST_DATABASE_URL` | Banco local de testes | Somente testes |

A chave secreta do Supabase não é usada nesta fase.

## Limitações conhecidas

- Nenhum projeto Supabase ou projeto Vercel foi criado ou conectado. O plano gratuito da conta Supabase já tem dois projetos de outros produtos.
- Fluxos de cadastro, confirmação de e-mail, recuperação de senha e login Google dependem da configuração no Supabase (ver `docs/configuracao.md`) e **não foram testados de ponta a ponta**.
- Não há testes E2E de navegador ainda.
- Não há limite de taxa (rate limiting) em cadastro e criação de organização.
- Não há exclusão de organização pela API. Excluir a conta do último proprietário é bloqueado pelo banco (`LAST_OWNER`) até que a transferência de propriedade seja implementada.
- Alteração de papéis, convites e alteração de endereço público ainda não existem; a interface indica isso.
- Modo escuro não implementado.

## Funcionalidades ainda não implementadas

Eventos, página pública, formulários dinâmicos, tipos de ingresso, inscrições, reserva de vagas, pagamentos e webhooks, notificações por e-mail, check-in e relatórios. Todos aparecem no menu como "Em breve" e não possuem rotas.

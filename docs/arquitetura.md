# Arquitetura

## Visão geral

Monólito modular em Next.js. Regras de negócio e autorização ficam em `src/modules/*` e no banco. Componentes de interface apenas chamam Server Actions ou consultas desses módulos.

```
src/
  app/            rotas (App Router): públicas, auth, onboarding, /app (painel)
  components/     ui/ (design system), navigation/, forms/
  lib/            env, supabase (servidor), erros, slug, redirecionamentos seguros
  modules/        auth, organizations (actions, queries, schemas, roles)
  proxy.ts        renovação de sessão e barreira de rotas privadas
  instrumentation.ts  validação de variáveis na inicialização
supabase/
  migrations/     schema, funções, RLS, grants (versionados)
  tests/          stub local do Supabase (somente testes)
tests/
  unit/           regras puras
  security/       isolamento contra PostgreSQL real
```

## Decisões

| Decisão | Motivo | Reversível? |
|---|---|---|
| Autenticação e dados via sessão do usuário (anon key + RLS) | Autorização fica no banco, não depende de código correto no servidor | Sim |
| Sem chave secreta na aplicação | Evita privilégio elevado acidental; operações privilegiadas virão como funções SQL restritas | Sim |
| `proxy.ts` apenas renova sessão e redireciona | É barreira de navegação; autorização real é RLS e checagem no servidor | Sim |
| Painel em `/app/[slug]`, endereço público em `/[slug]` (fase 2) | Evita colisão entre slugs de organização e rotas do sistema (slugs reservados) | Sim |
| Renderização dinâmica em todas as rotas | Sessão e dados são por usuário; evita pré-render dependente de ambiente | Sim |
| Sem cliente de browser do Supabase | Todo fluxo usa Server Actions e route handlers; o navegador nunca fala com o Auth diretamente | Sim |
| `cacheComponents` desativado | Dados privados não são cacheados nesta fase; cache seguro será definido com eventos públicos | Sim |
| Papéis em tabela, não em metadados do usuário | `user_metadata` é editável pelo cliente e não pode definir autoridade | Não recomendável reverter |

## Fluxos

**Cadastro:** `signUp` → trigger cria o perfil com o nome do metadado → confirmação por `/auth/confirm` (token_hash) → onboarding.

**Criar organização:** `create_organization(name, slug)` (função `SECURITY DEFINER`, `search_path` fixo) cria a organização e o vínculo de proprietário na mesma transação e grava auditoria. O dono é sempre `auth.uid()`.

**Acesso ao painel:** `proxy.ts` exige sessão em `/app` e `/onboarding`. A página busca a organização pelo slug com o cliente do usuário; slug inexistente ou sem vínculo responde 404 igual.

## Pontos de atenção para escala

- Consultas de membros usam função `list_organization_members`, que checa vínculo e evita N+1.
- Indicadores (fase 6) devem vir de consultas agregadas no banco, com índices em `(organization_id, ...)`.

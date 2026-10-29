# Segurança e privacidade

## Controles implementados

- **Isolamento:** RLS em todas as tabelas de `public`; testes de isolamento contra PostgreSQL real (35 casos de banco).
- **Autorização no servidor:** Server Actions checam papel antes de agir e mensagens são claras; o banco é a garantia final.
- **Sem confiança em identidade enviada pelo cliente:** `organization_id` e `user_id` nunca vêm do formulário para operações de escrita; o dono de uma organização é `auth.uid()`.
- **Sessão:** `proxy.ts` renova o token com `getClaims` (valida assinatura). Ações e páginas privadas usam `getUser` (validação no servidor de autenticação).
- **Redirecionamentos:** `safeNextPath` aceita só caminhos internos.
- **Mensagens de erro:** erros do banco são traduzidos; nunca há SQL ou stack para o usuário. Login não revela se um e-mail existe.
- **Cabeçalhos:** `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Permissions-Policy`. CSP ainda não definida (será definida com as páginas públicas).
- **Segredos:** nenhuma chave secreta no código, no bundle ou em `.env.example`. `.env*` é ignorado, exceto `.env.example`.
- **Auditoria:** criação de organização é registrada em `audit_logs`; leitura restrita a owner e admin.
- **Limite de taxa:** contador no banco (`private.rate_limits`) por IP nas ações públicas e teto de inscrições por evento no próprio banco. Detalhes em `docs/deploy.md`.
- **Rotas inexistentes:** slugs de organização inexistentes ou sem acesso retornam 404 idêntico.

## Pendências de segurança (antes de produção)

- Tetos de gasto e Firewall nos painéis da Vercel e do Supabase (checklist em `docs/deploy.md`).
- Configurar proteção contra senhas vazadas e política de senha no Supabase Auth.
- Reavaliar `get_advisors` (security) após cada migration; o último resultado só apontava a proteção de senhas vazadas e as funções públicas intencionais.
- Definir CSP para páginas públicas.
- Revisar `search_path` e grants após cada migration nova.

## LGPD (rascunho de tratamento)

Dados pessoais nesta fase: nome, e-mail e identificador de autenticação de usuários da plataforma, e dados de auditoria.

- **Finalidade:** acesso à plataforma e gestão de organizações.
- **Base legal:** execução de contrato com o usuário. A análise final da base legal de cada tratamento futuro (inscritos, pagamentos, presença) é pendência de decisão do responsável pelo produto.
- **Minimização:** só nome e e-mail são coletados no cadastro.
- **Retenção e exclusão:** exclusão da conta remove o perfil e os vínculos em cascata. Registros de auditoria mantêm `actor_user_id` nulo após a exclusão. Prazos de retenção de logs ainda precisam ser definidos.
- **Titulares:** atendimento a acesso, correção e exclusão ainda não tem fluxo próprio no produto.
- **Acesso a dados de terceiros:** o diretório de membros expõe apenas nome, papel e situação de quem já pertence à organização.

Este texto é um rascunho técnico e não substitui parecer jurídico.

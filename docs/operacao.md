# Operação e diagnóstico

## Verificações rápidas

- **Variáveis:** se rotas privadas retornam 503, veja no log do servidor a mensagem `[eventhubs] Configuração ausente...` com os nomes faltantes.
- **Sessão:** usuário é redirecionado a `/login` em loop → verifique a URL do projeto Supabase e o domínio dos cookies.
- **Link de e-mail inválido:** a tela de login mostra "O link expirou". Verifique se a URL do link está nas Redirect URLs.
- **Permissão:** erro `42501` nos logs significa RLS ou grant negando a operação. Verifique o papel do usuário em `organization_members`.

## Consultas úteis (somente leitura, em ambiente autorizado)

```sql
-- Membros de uma organização e papéis
select m.user_id, m.role, m.status from public.organization_members m
join public.organizations o on o.id = m.organization_id where o.slug = 'exemplo';

-- Ações recentes
select action, actor_user_id, created_at from public.audit_logs
where organization_id = '<uuid>' order by created_at desc limit 50;
```

## Segurança do banco

Após cada migration, rode no projeto:

- `get_advisors` do tipo `security` (Supabase CLI ou painel) e corrija o que aparecer.
- `npm run test:db` contra um banco local recriado com as mesmas migrations.

## Limites conhecidos

- Excluir a conta do último proprietário é bloqueado (`LAST_OWNER`). Para encerrar uma organização, transfira a propriedade antes (fluxo ainda não existe).
- Sem limite de taxa implementado: monitore picos de cadastro.
- Sem observabilidade externa ainda: erros aparecem apenas nos logs do runtime da Vercel.

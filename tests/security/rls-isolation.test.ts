import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Testes de isolamento contra PostgreSQL real com RLS, grants e funções ativas.
// Cada teste roda numa transação com role/JWT de um usuário e faz ROLLBACK ao final.
// Requer TEST_DATABASE_URL apontando para um banco local recriado por `npm run db:reset:local`.

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL não definida. Rode `npm run db:reset:local` com ela configurada.");
}

const pool = new pg.Pool({ connectionString: url, max: 4 });

type Caller = { role: "authenticated"; userId: string } | { role: "anon" };

async function asCaller<T>(caller: Caller, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query("begin");
    await conn.query(`set local role ${caller.role}`);
    const claims = caller.role === "authenticated" ? JSON.stringify({ sub: caller.userId, role: "authenticated" }) : "";
    await conn.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    return await fn(conn);
  } finally {
    await conn.query("rollback");
    conn.release();
  }
}

async function asAdmin<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const conn = await pool.connect();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}

const ids = {
  ownerA: randomUUID(),
  adminA: randomUUID(),
  eventManagerA: randomUUID(),
  checkinA: randomUUID(),
  viewerA: randomUUID(),
  suspendedA: randomUUID(),
  ownerB: randomUUID(),
  stranger: randomUUID(),
};
const orgA = randomUUID();
const orgB = randomUUID();
const slugA = `isolamento-a-${orgA.slice(0, 8)}`;
const slugB = `isolamento-b-${orgB.slice(0, 8)}`;

beforeAll(async () => {
  await asAdmin(async (c) => {
    for (const [key, id] of Object.entries(ids)) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, `${key}-${id}@test.local`]);
    }
    await c.query("insert into public.organizations (id, slug, name, created_by) values ($1, $2, 'Org A', $3), ($4, $5, 'Org B', $6)", [
      orgA, slugA, ids.ownerA, orgB, slugB, ids.ownerB,
    ]);
    await c.query(
      `insert into public.organization_members (organization_id, user_id, role, status) values
        ($1, $2, 'owner', 'active'),
        ($1, $3, 'admin', 'active'),
        ($1, $4, 'event_manager', 'active'),
        ($1, $5, 'checkin_operator', 'active'),
        ($1, $6, 'report_viewer', 'active'),
        ($1, $7, 'owner', 'suspended'),
        ($8, $9, 'owner', 'active')`,
      [orgA, ids.ownerA, ids.adminA, ids.eventManagerA, ids.checkinA, ids.viewerA, ids.suspendedA, orgB, ids.ownerB],
    );
    await c.query("insert into public.audit_logs (organization_id, actor_user_id, action) values ($1, $2, 'seed.test')", [orgA, ids.ownerA]);
  });
});

afterAll(async () => {
  await asAdmin(async (c) => {
    // Limpeza de teste: desativa triggers da sessão para remover a massa de teste inteira.
    await c.query("set session_replication_role = replica");
    await c.query("delete from auth.users where id = any($1::uuid[])", [Object.values(ids)]);
    await c.query("delete from public.organizations where id = any($1::uuid[])", [[orgA, orgB]]);
    await c.query("set session_replication_role = origin");
  });
  await pool.end();
});

const owner = { role: "authenticated" as const, userId: ids.ownerA };
const ownerB = { role: "authenticated" as const, userId: ids.ownerB };
const admin = { role: "authenticated" as const, userId: ids.adminA };
const eventManager = { role: "authenticated" as const, userId: ids.eventManagerA };
const checkin = { role: "authenticated" as const, userId: ids.checkinA };
const viewer = { role: "authenticated" as const, userId: ids.viewerA };
const suspended = { role: "authenticated" as const, userId: ids.suspendedA };
const stranger = { role: "authenticated" as const, userId: ids.stranger };
const anon = { role: "anon" as const };

async function orgNameA(): Promise<string> {
  return asAdmin(async (c) => (await c.query("select name from public.organizations where id = $1", [orgA])).rows[0].name);
}

describe("isolamento entre organizações", () => {
  it("membro vê apenas a própria organização", async () => {
    const rows = await asCaller(owner, async (c) => (await c.query("select id from public.organizations")).rows);
    expect(rows.map((r) => r.id)).toEqual([orgA]);
  });

  it("usuário sem vínculo não vê nenhuma organização", async () => {
    const rows = await asCaller(stranger, async (c) => (await c.query("select id from public.organizations")).rows);
    expect(rows).toHaveLength(0);
  });

  it("proprietário de outra organização não consegue alterar a organização A", async () => {
    const result = await asCaller(ownerB, async (c) =>
      c.query("update public.organizations set name = 'Invadida' where id = $1", [orgA]),
    );
    expect(result.rowCount).toBe(0);
    expect(await orgNameA()).toBe("Org A");
  });

  it("membro suspenso perde o acesso à organização", async () => {
    const rows = await asCaller(suspended, async (c) => (await c.query("select id from public.organizations")).rows);
    expect(rows).toHaveLength(0);
  });

  it("usuário não consegue listar membros de outra organização", async () => {
    const rows = await asCaller(ownerB, async (c) =>
      (await c.query("select user_id from public.organization_members where organization_id = $1", [orgA])).rows,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("troca do endereço público", () => {
  const novo = `${slugA}-novo`;
  const asUser = (c: pg.PoolClient, userId: string) =>
    c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);

  it("owner troca o slug e o antigo passa a resolver para o novo, inclusive para anon", async () => {
    const resolved = await asCaller(owner, async (c) => {
      expect((await c.query("update public.organizations set slug = $1 where id = $2", [novo, orgA])).rowCount).toBe(1);
      await c.query("set local role anon");
      return (await c.query("select public.resolve_organization_slug($1) as slug", [slugA.toUpperCase()])).rows[0].slug;
    });
    expect(resolved).toBe(novo);
  });

  it("outra organização não pode assumir o endereço antigo", async () => {
    await expect(
      asCaller(owner, async (c) => {
        await c.query("update public.organizations set slug = $1 where id = $2", [novo, orgA]);
        await asUser(c, ids.ownerB);
        await c.query("update public.organizations set slug = $1 where id = $2", [slugA, orgB]);
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("a própria organização pode voltar ao endereço antigo", async () => {
    const resolved = await asCaller(owner, async (c) => {
      await c.query("update public.organizations set slug = $1 where id = $2", [novo, orgA]);
      await c.query("update public.organizations set slug = $1 where id = $2", [slugA, orgA]);
      return (await c.query("select public.resolve_organization_slug($1) as slug", [novo])).rows[0].slug;
    });
    expect(resolved).toBe(slugA);
  });

  it("event_manager não troca o slug", async () => {
    const result = await asCaller(eventManager, async (c) => c.query("update public.organizations set slug = $1 where id = $2", [novo, orgA]));
    expect(result.rowCount).toBe(0);
  });
});

describe("permissões por papel", () => {
  it.each([
    ["owner", owner],
    ["admin", admin],
  ])("%s pode alterar o nome da organização", async (_label, caller) => {
    const result = await asCaller(caller, async (c) =>
      c.query("update public.organizations set name = 'Org A Renomeada' where id = $1", [orgA]),
    );
    expect(result.rowCount).toBe(1);
    // A mudança foi revertida pelo ROLLBACK do helper.
    expect(await orgNameA()).toBe("Org A");
  });

  it.each([
    ["event_manager", eventManager],
    ["checkin_operator", checkin],
    ["report_viewer", viewer],
  ])("%s não altera a organização (0 linhas afetadas)", async (_label, caller) => {
    const result = await asCaller(caller, async (c) =>
      c.query("update public.organizations set name = 'Negado' where id = $1", [orgA]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("admin não altera papéis de membros; apenas o proprietário altera", async () => {
    const byAdmin = await asCaller(admin, async (c) =>
      c.query("update public.organization_members set role = 'owner' where organization_id = $1 and user_id = $2", [orgA, ids.viewerA]),
    );
    expect(byAdmin.rowCount).toBe(0);

    const byOwner = await asCaller(owner, async (c) =>
      c.query("update public.organization_members set role = 'event_manager' where organization_id = $1 and user_id = $2", [orgA, ids.viewerA]),
    );
    expect(byOwner.rowCount).toBe(1);
  });

  it("admin não remove membros", async () => {
    const result = await asCaller(admin, async (c) =>
      c.query("delete from public.organization_members where organization_id = $1 and user_id = $2", [orgA, ids.viewerA]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("report_viewer não lê o log de auditoria; admin lê", async () => {
    const viewerRows = await asCaller(viewer, async (c) => (await c.query("select id from public.audit_logs")).rows);
    expect(viewerRows).toHaveLength(0);

    const adminRows = await asCaller(admin, async (c) => (await c.query("select id from public.audit_logs")).rows);
    expect(adminRows.length).toBeGreaterThan(0);
  });
});

describe("tentativas de manipular organization_id e vínculos", () => {
  it("proprietário de B não consegue se inserir como membro de A", async () => {
    await expect(
      asCaller(ownerB, async (c) =>
        c.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [orgA, ids.ownerB]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cliente não insere organização diretamente", async () => {
    await expect(
      asCaller(stranger, async (c) =>
        c.query("insert into public.organizations (slug, name, created_by) values ('direto-sem-rpc', 'Direto', $1)", [ids.stranger]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cliente não move um membro para outra organização", async () => {
    await expect(
      asCaller(owner, async (c) =>
        c.query("update public.organization_members set organization_id = $1 where user_id = $2", [orgB, ids.viewerA]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cliente não altera o created_by de uma organização", async () => {
    await expect(
      asCaller(owner, async (c) => c.query("update public.organizations set created_by = $1 where id = $2", [ids.stranger, orgA])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("último proprietário ativo não pode ser removido", async () => {
    await expect(
      asCaller(owner, async (c) =>
        c.query("delete from public.organization_members where organization_id = $1 and user_id = $2", [orgA, ids.ownerA]),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining("LAST_OWNER") });
  });
});

describe("diretório de membros", () => {
  it("membro ativo lista os membros da própria organização", async () => {
    const rows = await asCaller(admin, async (c) =>
      (await c.query("select user_id, role, status from public.list_organization_members($1)", [orgA])).rows,
    );
    // Inclui o membro suspenso porque o diretório mostra o status para administradores.
    expect(rows).toHaveLength(6);
  });

  it("usuário de outra organização não lista membros de A", async () => {
    await expect(
      asCaller(ownerB, async (c) => c.query("select user_id from public.list_organization_members($1)", [orgA])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("membro suspenso não lista membros", async () => {
    await expect(
      asCaller(suspended, async (c) => c.query("select user_id from public.list_organization_members($1)", [orgA])),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("perfis", () => {
  it("usuário lê apenas o próprio perfil", async () => {
    const rows = await asCaller(owner, async (c) => (await c.query("select id from public.profiles")).rows);
    expect(rows.map((r) => r.id)).toEqual([ids.ownerA]);
  });

  it("usuário não altera o id do próprio perfil", async () => {
    await expect(
      asCaller(owner, async (c) => c.query("update public.profiles set id = $1 where id = $2", [randomUUID(), ids.ownerA])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("usuário altera o próprio nome", async () => {
    const result = await asCaller(owner, async (c) =>
      c.query("update public.profiles set full_name = 'Junio Teste' where id = $1", [ids.ownerA]),
    );
    expect(result.rowCount).toBe(1);
  });
});

describe("criação de organização (create_organization)", () => {
  it("cria a organização e o vínculo de proprietário do próprio chamador", async () => {
    const created = await asCaller(stranger, async (c) => {
      const org = (await c.query("select * from public.create_organization($1, $2)", ["Igreja Exemplo", "  Igreja-Exemplo  "])).rows[0];
      const member = (
        await c.query("select role, status from public.organization_members where organization_id = $1 and user_id = auth.uid()", [org.id])
      ).rows[0];
      return { org, member };
    });
    expect(created.org.slug).toBe("igreja-exemplo");
    expect(created.member).toEqual({ role: "owner", status: "active" });
  });

  it("slug duplicado é recusado com unique_violation", async () => {
    await expect(
      asCaller(stranger, async (c) => c.query("select * from public.create_organization($1, $2)", ["Outra", slugA])),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("slug inválido é recusado pela constraint do banco", async () => {
    await expect(
      asCaller(stranger, async (c) => c.query("select * from public.create_organization($1, $2)", ["Ruim", "Não Válido!"])),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("nome curto demais é recusado pela constraint de tamanho", async () => {
    await expect(
      asCaller(stranger, async (c) => c.query("select * from public.create_organization($1, $2)", [" a ", "nome-curto-ok"])),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("chamada sem usuário autenticado é recusada", async () => {
    await expect(
      asCaller({ role: "authenticated", userId: "" }, async (c) =>
        c.query("select * from public.create_organization($1, $2)", ["Sem Dono", "sem-dono-x"]),
      ),
    ).rejects.toMatchObject({ code: "28000" });
  });
});

describe("papel anon e superfície da Data API", () => {
  it("anon não lê organizações", async () => {
    await expect(asCaller(anon, async (c) => c.query("select id from public.organizations"))).rejects.toMatchObject({ code: "42501" });
  });

  it("anon não executa create_organization", async () => {
    await expect(
      asCaller(anon, async (c) => c.query("select * from public.create_organization($1, $2)", ["Anon", "anon-org-x"])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("funções de autorização não são executáveis por anon", async () => {
    await expect(
      asCaller(anon, async (c) => c.query("select private.has_org_role($1, array['owner']::public.organization_role[])", [orgA])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("nenhuma tabela de public concede privilégios a anon", async () => {
    const rows = await asAdmin(async (c) =>
      (await c.query("select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'")).rows,
    );
    expect(rows).toEqual([]);
  });

  it("toda tabela de public tem RLS habilitado", async () => {
    const rows = await asAdmin(async (c) =>
      (await c.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      )).rows,
    );
    expect(rows).toEqual([]);
  });

  it("funções privilegiadas têm search_path fixo", async () => {
    const rows = await asAdmin(async (c) =>
      (await c.query(
        `select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private') and p.prosecdef`,
      )).rows,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const config: string[] = row.proconfig ?? [];
      expect(config.some((entry) => entry.startsWith("search_path=")), row.proname).toBe(true);
    }
  });
});

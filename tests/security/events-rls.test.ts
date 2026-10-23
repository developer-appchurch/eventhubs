import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVENT_STATUSES, EVENT_TRANSITIONS } from "../../src/modules/events/status";

// Fase 2: isolamento e regras de eventos, ingressos e formulários contra PostgreSQL real.
// Mesmo padrão de rls-isolation.test.ts: cada chamada roda numa transação com o papel e o
// JWT do usuário e termina em ROLLBACK.

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
  managerA: randomUUID(),
  checkinA: randomUUID(),
  viewerA: randomUUID(),
  ownerB: randomUUID(),
};
const orgA = randomUUID();
const orgB = randomUUID();
const slugA = `eventos-a-${orgA.slice(0, 8)}`;
const slugB = `eventos-b-${orgB.slice(0, 8)}`;
let draftEvent = "";
let publishedEvent = "";
let eventB = "";

const owner = { role: "authenticated" as const, userId: ids.ownerA };
const manager = { role: "authenticated" as const, userId: ids.managerA };
const checkin = { role: "authenticated" as const, userId: ids.checkinA };
const viewer = { role: "authenticated" as const, userId: ids.viewerA };
const ownerB = { role: "authenticated" as const, userId: ids.ownerB };
const anon = { role: "anon" as const };

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

// Insere evento como o próprio usuário (passa pela RLS e pelos triggers de criação).
const insertEventSql = `
  insert into public.events (organization_id, slug, title, starts_at, ends_at,
    registration_opens_at, registration_closes_at, capacity, venue_name)
  values ($1, $2, $3, $4, $5, $6, $7, $8, 'Auditório') returning id`;

function eventValues(org: string, slug: string, capacity = 100) {
  return [org, slug, `Evento ${slug}`, future(30), future(31), future(-1), future(29), capacity];
}

async function createEventAs(userId: string, org: string, slug: string): Promise<string> {
  const conn = await pool.connect();
  try {
    await conn.query("begin");
    await conn.query("set local role authenticated");
    await conn.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId })]);
    const { rows } = await conn.query(insertEventSql, eventValues(org, slug));
    await conn.query("commit");
    return rows[0].id;
  } catch (error) {
    await conn.query("rollback");
    throw error;
  } finally {
    conn.release();
  }
}

beforeAll(async () => {
  await asAdmin(async (c) => {
    for (const [key, id] of Object.entries(ids)) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, `${key}-${id}@test.local`]);
    }
    await c.query("insert into public.organizations (id, slug, name, created_by) values ($1, $2, 'Org A', $3), ($4, $5, 'Org B', $6)", [
      orgA, slugA, ids.ownerA, orgB, slugB, ids.ownerB,
    ]);
    await c.query(
      `insert into public.organization_members (organization_id, user_id, role) values
        ($1, $2, 'owner'), ($1, $3, 'event_manager'), ($1, $4, 'checkin_operator'), ($1, $5, 'report_viewer'),
        ($6, $7, 'owner')`,
      [orgA, ids.ownerA, ids.managerA, ids.checkinA, ids.viewerA, orgB, ids.ownerB],
    );
  });

  draftEvent = await createEventAs(ids.managerA, orgA, "rascunho");
  publishedEvent = await createEventAs(ids.managerA, orgA, "publicado");
  eventB = await createEventAs(ids.ownerB, orgB, "evento-b");

  await asAdmin(async (c) => {
    await c.query("insert into public.ticket_types (organization_id, event_id, name) values ($1, $2, 'Gratuito'), ($3, $4, 'Gratuito B')", [
      orgA, publishedEvent, orgB, eventB,
    ]);
  });
  await asAdmin(async (c) => {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids.managerA })]);
    await c.query("select public.change_event_status($1, 'published')", [publishedEvent]);
    await c.query("commit");
  });
});

afterAll(async () => {
  await asAdmin(async (c) => {
    await c.query("set session_replication_role = replica");
    await c.query("delete from public.organizations where id = any($1::uuid[])", [[orgA, orgB]]);
    await c.query("delete from auth.users where id = any($1::uuid[])", [Object.values(ids)]);
    await c.query("set session_replication_role = origin");
  });
  await pool.end();
});

describe("isolamento de eventos entre organizações", () => {
  it("membro vê só os eventos da própria organização", async () => {
    const rows = await asCaller(checkin, async (c) => (await c.query("select id from public.events order by slug")).rows);
    expect(rows.map((r) => r.id).sort()).toEqual([draftEvent, publishedEvent].sort());
  });

  it("proprietário de B não lê eventos, ingressos, campos nem versões de A", async () => {
    await asCaller(ownerB, async (c) => {
      for (const table of ["events", "ticket_types", "form_fields", "event_forms"]) {
        const column = table === "events" ? "id" : "event_id";
        const { rows } = await c.query(`select 1 from public.${table} where ${column} = any($1::uuid[])`, [[draftEvent, publishedEvent]]);
        expect(rows, table).toHaveLength(0);
      }
    });
  });

  it("proprietário de B não altera nem apaga evento de A", async () => {
    await asCaller(ownerB, async (c) => {
      expect((await c.query("update public.events set title = 'Invadido' where id = $1", [draftEvent])).rowCount).toBe(0);
      expect((await c.query("delete from public.events where id = $1", [draftEvent])).rowCount).toBe(0);
    });
  });

  it("não cria evento em outra organização manipulando organization_id", async () => {
    await expect(
      asCaller(ownerB, async (c) => c.query(insertEventSql, eventValues(orgA, "invasao"))),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("não cria ingresso apontando o evento de outra organização", async () => {
    await expect(
      asCaller(owner, async (c) =>
        c.query("insert into public.ticket_types (organization_id, event_id, name) values ($1, $2, 'Cruzado')", [orgA, eventB]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asCaller(owner, async (c) =>
        c.query("insert into public.ticket_types (organization_id, event_id, name) values ($1, $2, 'Cruzado')", [orgB, eventB]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("não muda status nem formulário de evento de outra organização", async () => {
    await expect(
      asCaller(ownerB, async (c) => c.query("select public.change_event_status($1, 'cancelled')", [draftEvent])),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asCaller(ownerB, async (c) => c.query("select public.save_event_form($1, '[]'::jsonb)", [draftEvent])),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asCaller(ownerB, async (c) => c.query("select public.get_event_preview($1)", [draftEvent])),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("permissões por papel em eventos", () => {
  it.each([
    ["checkin_operator", checkin],
    ["report_viewer", viewer],
  ])("%s lê, mas não cria, altera ou publica eventos", async (_label, caller) => {
    await asCaller(caller, async (c) => {
      expect((await c.query("select 1 from public.events where id = $1", [draftEvent])).rows).toHaveLength(1);
      expect((await c.query("update public.events set title = 'Negado' where id = $1", [draftEvent])).rowCount).toBe(0);
      expect((await c.query("update public.ticket_types set price_cents = 1 where event_id = $1", [publishedEvent])).rowCount).toBe(0);
    });
    await expect(asCaller(caller, async (c) => c.query(insertEventSql, eventValues(orgA, "negado")))).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      asCaller(caller, async (c) => c.query("select public.change_event_status($1, 'published')", [draftEvent])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("gestor de eventos edita o evento e o ingresso", async () => {
    await asCaller(manager, async (c) => {
      expect((await c.query("update public.events set title = 'Novo título' where id = $1", [draftEvent])).rowCount).toBe(1);
      expect((await c.query("update public.ticket_types set price_cents = 5000 where event_id = $1", [publishedEvent])).rowCount).toBe(1);
    });
  });

  it("cliente não altera status, published_at nem created_by diretamente", async () => {
    for (const column of ["status = 'published'", "published_at = now()", `created_by = '${ids.ownerB}'`]) {
      await expect(
        asCaller(owner, async (c) => c.query(`update public.events set ${column} where id = $1`, [draftEvent])),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("cliente não grava campos nem versões de formulário fora da função", async () => {
    await expect(
      asCaller(owner, async (c) => c.query("update public.form_fields set required = false where event_id = $1", [draftEvent])),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asCaller(owner, async (c) => c.query("delete from public.event_forms where event_id = $1", [draftEvent])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("evento já publicado não pode ser apagado (só cancelado); rascunho pode", async () => {
    await asCaller(owner, async (c) => {
      expect((await c.query("delete from public.events where id = $1", [publishedEvent])).rowCount).toBe(0);
      expect((await c.query("delete from public.events where id = $1", [draftEvent])).rowCount).toBe(1);
    });
  });
});

describe("acesso anônimo e página pública", () => {
  it("anon não lê nenhuma tabela de eventos", async () => {
    for (const table of ["events", "ticket_types", "form_fields", "event_forms"]) {
      await expect(asCaller(anon, async (c) => c.query(`select 1 from public.${table}`)), table).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("evento publicado aparece na página pública sem dados privados", async () => {
    const payload = await asCaller(anon, async (c) =>
      (await c.query("select public.get_public_event($1, 'publicado') as p", [slugA])).rows[0].p,
    );
    expect(payload.event.id).toBe(publishedEvent);
    expect(payload.event).not.toHaveProperty("created_by");
    expect(payload.event).not.toHaveProperty("online_url");
    expect(payload.tickets).toHaveLength(1);
    expect(payload.form.fields.map((f: { key: string }) => f.key)).toEqual(["full_name", "email"]);
  });

  it("rascunho e slug inexistente respondem igual (null)", async () => {
    await asCaller(anon, async (c) => {
      expect((await c.query("select public.get_public_event($1, 'rascunho') as p", [slugA])).rows[0].p).toBeNull();
      expect((await c.query("select public.get_public_event($1, 'nao-existe') as p", [slugA])).rows[0].p).toBeNull();
      expect((await c.query("select public.list_public_events('org-inexistente') as p")).rows[0].p).toBeNull();
    });
  });

  it("lista pública da organização mostra só eventos publicados", async () => {
    const payload = await asCaller(anon, async (c) => (await c.query("select public.list_public_events($1) as p", [slugA])).rows[0].p);
    expect(payload.events.map((e: { slug: string }) => e.slug)).toEqual(["publicado"]);
  });

  it("anon não usa funções administrativas", async () => {
    await expect(
      asCaller(anon, async (c) => c.query("select public.change_event_status($1, 'cancelled')", [publishedEvent])),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(asCaller(anon, async (c) => c.query("select public.get_event_preview($1)", [draftEvent]))).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("ciclo de status", () => {
  it("tabela de transições do banco é igual à da aplicação", async () => {
    const rows = await asAdmin(async (c) =>
      (
        await c.query(
          `select f::text as "from", t::text as "to", private.event_transition_allowed(f, t) as ok
             from unnest(enum_range(null::public.event_status)) f, unnest(enum_range(null::public.event_status)) t`,
        )
      ).rows,
    );
    expect(rows).toHaveLength(EVENT_STATUSES.length ** 2);
    for (const row of rows) {
      const expected = EVENT_TRANSITIONS[row.from as keyof typeof EVENT_TRANSITIONS].includes(row.to);
      expect(row.ok, `${row.from} -> ${row.to}`).toBe(expected);
    }
  });

  it("publicar exige ingresso ativo", async () => {
    await expect(
      asCaller(manager, async (c) => c.query("select public.change_event_status($1, 'published')", [draftEvent])),
    ).rejects.toThrow("NO_ACTIVE_TICKET");
  });

  it("transição inválida é recusada (rascunho -> encerrado)", async () => {
    await expect(
      asCaller(manager, async (c) => c.query("select public.change_event_status($1, 'ended')", [draftEvent])),
    ).rejects.toThrow("INVALID_TRANSITION");
  });

  it("encerrar inscrições, reabrir e cancelar registram auditoria; cancelado fica travado", async () => {
    await asCaller(owner, async (c) => {
      await c.query("select public.change_event_status($1, 'registration_closed')", [publishedEvent]);
      await c.query("select public.change_event_status($1, 'published')", [publishedEvent]);
      const cancelled = (await c.query("select * from public.change_event_status($1, 'cancelled')", [publishedEvent])).rows[0];
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelled_at).not.toBeNull();

      const audit = await c.query(
        "select metadata ->> 'to' as to from public.audit_logs where target_id = $1 and action = 'event.status_changed' order by id",
        [publishedEvent],
      );
      expect(audit.rows.map((r) => r.to)).toEqual(["published", "registration_closed", "published", "cancelled"]);

      await c.query("savepoint s");
      await expect(c.query("update public.events set title = 'Depois' where id = $1", [publishedEvent])).rejects.toThrow("EVENT_LOCKED");
      await c.query("rollback to savepoint s");
      const ticketUpdate = await c.query("update public.ticket_types set price_cents = 1 where event_id = $1", [publishedEvent]);
      expect(ticketUpdate.rowCount).toBe(0);
    });
  });

  it("slug fica fixo depois da publicação", async () => {
    await expect(
      asCaller(owner, async (c) => c.query("update public.events set slug = 'outro-slug' where id = $1", [publishedEvent])),
    ).rejects.toThrow("SLUG_LOCKED");
    await asCaller(owner, async (c) => {
      expect((await c.query("update public.events set slug = 'rascunho-novo' where id = $1", [draftEvent])).rowCount).toBe(1);
    });
  });

  it("datas e capacidade inconsistentes são recusadas pelo banco", async () => {
    await asCaller(owner, async (c) => {
      for (const set of ["ends_at = starts_at - interval '1 hour'", "capacity = 0", "registration_closes_at = ends_at + interval '1 day'"]) {
        await c.query("savepoint s");
        await expect(c.query(`update public.events set ${set} where id = $1`, [draftEvent]), set).rejects.toMatchObject({ code: "23514" });
        await c.query("rollback to savepoint s");
      }
    });
  });
});

describe("formulário dinâmico e versões", () => {
  const baseFields = [
    { key: "full_name", label: "Nome completo", type: "name", required: true },
    { key: "email", label: "E-mail", type: "email", required: true },
  ];

  it("novo evento nasce com nome e e-mail na versão 1", async () => {
    const rows = await asCaller(manager, async (c) =>
      (await c.query("select version, fields from public.event_forms where event_id = $1", [draftEvent])).rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(1);
    expect(rows[0].fields.map((f: { key: string }) => f.key)).toEqual(["full_name", "email"]);
  });

  it("salvar cria nova versão e preserva a anterior; salvar igual não duplica", async () => {
    await asCaller(manager, async (c) => {
      const fields = [...baseFields, { key: "igreja", label: "Igreja", type: "dropdown", required: false, options: ["Centro", "Norte"] }];
      const v2 = (await c.query("select public.save_event_form($1, $2::jsonb) as v", [draftEvent, JSON.stringify(fields)])).rows[0].v;
      expect(v2).toBe(2);
      const again = (await c.query("select public.save_event_form($1, $2::jsonb) as v", [draftEvent, JSON.stringify(fields)])).rows[0].v;
      expect(again).toBe(2);

      const v3 = (await c.query("select public.save_event_form($1, $2::jsonb) as v", [draftEvent, JSON.stringify(baseFields)])).rows[0].v;
      expect(v3).toBe(3);

      const versions = (await c.query("select version, jsonb_array_length(fields) as n from public.event_forms where event_id = $1 order by version", [draftEvent])).rows;
      expect(versions).toEqual([{ version: 1, n: 2 }, { version: 2, n: 3 }, { version: 3, n: 2 }]);
    });
  });

  it("recusa formulário sem nome e e-mail obrigatórios", async () => {
    await expect(
      asCaller(manager, async (c) =>
        c.query("select public.save_event_form($1, $2::jsonb)", [draftEvent, JSON.stringify([baseFields[0], { ...baseFields[1], required: false }])]),
      ),
    ).rejects.toThrow("IDENTITY_FIELDS_REQUIRED");
  });

  it("recusa seleção sem opções e chave inválida", async () => {
    for (const extra of [
      { key: "cor", label: "Cor", type: "single_choice", options: [] },
      { key: "Chave Inválida", label: "X", type: "short_text" },
    ]) {
      await expect(
        asCaller(manager, async (c) => c.query("select public.save_event_form($1, $2::jsonb)", [draftEvent, JSON.stringify([...baseFields, extra])])),
      ).rejects.toMatchObject({ code: "23514" });
    }
  });
});

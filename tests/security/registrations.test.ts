import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Fase 3: inscrições gratuitas, capacidade sob concorrência, idempotência e RLS dos inscritos.
// Mesmo padrão dos demais testes de banco; as inscrições concorrentes fazem COMMIT de verdade
// (cada uma na própria conexão) para provar que a trava do evento segura a última vaga.

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL não definida. Rode `npm run db:reset:local` com ela configurada.");
}

const pool = new pg.Pool({ connectionString: url, max: 30 });

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

const ids = { ownerA: randomUUID(), managerA: randomUUID(), checkinA: randomUUID(), viewerA: randomUUID(), ownerB: randomUUID() };
const orgA = randomUUID();
const orgB = randomUUID();
const owner = { role: "authenticated" as const, userId: ids.ownerA };
const manager = { role: "authenticated" as const, userId: ids.managerA };
const checkin = { role: "authenticated" as const, userId: ids.checkinA };
const viewer = { role: "authenticated" as const, userId: ids.viewerA };
const ownerB = { role: "authenticated" as const, userId: ids.ownerB };
const anon = { role: "anon" as const };

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

type Ev = { id: string; free: string; paid: string; limited: string };
let main: Ev;
let crowd: Ev;
let draft = "";

async function asManagerCommit(sql: string, params: unknown[]) {
  const conn = await pool.connect();
  try {
    await conn.query("begin");
    await conn.query("set local role authenticated");
    await conn.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids.managerA })]);
    const result = await conn.query(sql, params);
    await conn.query("commit");
    return result;
  } catch (error) {
    await conn.query("rollback");
    throw error;
  } finally {
    conn.release();
  }
}

async function createEvent(slug: string, capacity: number, publish = true): Promise<Ev> {
  const { rows } = await asManagerCommit(
    `insert into public.events (organization_id, slug, title, starts_at, ends_at, capacity, venue_name)
     values ($1, $2, $3, $4, $5, $6, 'Auditório') returning id`,
    [orgA, slug, `Evento ${slug}`, future(30), future(31), capacity],
  );
  const id = rows[0].id as string;
  const t = await asManagerCommit(
    `insert into public.ticket_types (organization_id, event_id, name, price_cents, quantity_limit, position) values
       ($1, $2, 'Gratuito', 0, null, 1), ($1, $2, 'Pago', 5000, null, 2), ($1, $2, 'Limitado', 0, 2, 3)
     returning id, name`,
    [orgA, id],
  );
  const byName = Object.fromEntries(t.rows.map((r) => [r.name, r.id]));
  if (publish) await asManagerCommit("select public.change_event_status($1, 'published')", [id]);
  return { id, free: byName.Gratuito, paid: byName.Pago, limited: byName.Limitado };
}

const answers = (email: string, extra: Record<string, unknown> = {}) => ({ full_name: "Maria Silva", email, ...extra });

// Inscrição anônima confirmada (COMMIT) em conexão própria. Devolve o resultado ou o código do erro.
async function register(
  event: string,
  ticket: string,
  body: Record<string, unknown>,
  key: string = randomUUID(),
  version = 1,
): Promise<{ public_token: string; status: string } | { error: string }> {
  const conn = await pool.connect();
  try {
    await conn.query("begin");
    await conn.query("set local role anon");
    const { rows } = await conn.query("select public.register_for_event($1, $2, $3, $4, $5) as r", [event, ticket, version, body, key]);
    await conn.query("commit");
    return rows[0].r;
  } catch (error) {
    await conn.query("rollback");
    return { error: (error as Error).message };
  } finally {
    conn.release();
  }
}

const countActive = (event: string, ticket?: string) =>
  asAdmin(async (c) => {
    const { rows } = await c.query(
      "select count(*)::int as n from public.registrations where event_id = $1 and ($2::uuid is null or ticket_type_id = $2) and status = 'confirmed'",
      [event, ticket ?? null],
    );
    return rows[0].n as number;
  });

beforeAll(async () => {
  await asAdmin(async (c) => {
    for (const [key, id] of Object.entries(ids)) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, `${key}-${id}@test.local`]);
    }
    await c.query("insert into public.organizations (id, slug, name, created_by) values ($1, $2, 'Org A', $3), ($4, $5, 'Org B', $6)", [
      orgA, `insc-a-${orgA.slice(0, 8)}`, ids.ownerA, orgB, `insc-b-${orgB.slice(0, 8)}`, ids.ownerB,
    ]);
    await c.query(
      `insert into public.organization_members (organization_id, user_id, role) values
        ($1, $2, 'owner'), ($1, $3, 'event_manager'), ($1, $4, 'checkin_operator'), ($1, $5, 'report_viewer'), ($6, $7, 'owner')`,
      [orgA, ids.ownerA, ids.managerA, ids.checkinA, ids.viewerA, orgB, ids.ownerB],
    );
  });
  main = await createEvent("principal", 100);
  crowd = await createEvent("lotado", 5);
  draft = (await createEvent("rascunho", 100, false)).id;
});

afterAll(async () => {
  await asAdmin(async (c) => {
    await c.query("set session_replication_role = replica");
    await c.query("delete from public.registrations where organization_id = any($1::uuid[])", [[orgA, orgB]]);
    await c.query("delete from public.organizations where id = any($1::uuid[])", [[orgA, orgB]]);
    await c.query("delete from auth.users where id = any($1::uuid[])", [Object.values(ids)]);
    await c.query("set session_replication_role = origin");
  });
  await pool.end();
});

describe("inscrição gratuita", () => {
  it("confirma, gera token aleatório e o participante consulta só pelo token", async () => {
    const result = await register(main.id, main.free, answers("Ana@Exemplo.com"));
    expect(result).toMatchObject({ status: "confirmed" });
    const token = (result as { public_token: string }).public_token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    await asCaller(anon, async (c) => {
      const { rows } = await c.query("select public.get_registration($1) as r", [token]);
      expect(rows[0].r).toMatchObject({ status: "confirmed", attendee_email: "ana@exemplo.com", ticket: { name: "Gratuito" } });
      const miss = await c.query("select public.get_registration($1) as r", ["0".repeat(64)]);
      expect(miss.rows[0].r).toBeNull();
      const bad = await c.query("select public.get_registration($1) as r", ["' or 1=1 --"]);
      expect(bad.rows[0].r).toBeNull();
    });
  });

  it("repetir a mesma requisição (idempotência) devolve a mesma inscrição sem duplicar", async () => {
    const key = randomUUID();
    const first = await register(main.id, main.free, answers("repetido@exemplo.com"), key);
    const second = await register(main.id, main.free, answers("repetido@exemplo.com"), key);
    expect(second).toEqual(first);
    const n = await asAdmin(async (c) => (await c.query("select count(*)::int n from public.registrations where idempotency_key = $1", [key])).rows[0].n);
    expect(n).toBe(1);
  });

  it("mesmo e-mail com outra requisição é recusado enquanto a inscrição estiver ativa; cancelada libera", async () => {
    await register(main.id, main.free, answers("unico@exemplo.com"));
    expect(await register(main.id, main.free, answers("UNICO@exemplo.com"))).toEqual({ error: "ALREADY_REGISTERED" });
    await asAdmin((c) => c.query("update public.registrations set status = 'cancelled' where event_id = $1 and attendee_email = 'unico@exemplo.com'", [main.id]));
    expect(await register(main.id, main.free, answers("unico@exemplo.com"))).toMatchObject({ status: "confirmed" });
  });

  it("recusa ingresso pago, de outro evento ou inexistente", async () => {
    expect(await register(main.id, main.paid, answers("pago@exemplo.com"))).toEqual({ error: "PAID_TICKET" });
    expect(await register(main.id, crowd.free, answers("outro@exemplo.com"))).toEqual({ error: "TICKET_UNAVAILABLE" });
    expect(await register(main.id, randomUUID(), answers("nada@exemplo.com"))).toEqual({ error: "TICKET_UNAVAILABLE" });
  });

  it("recusa rascunho e evento com inscrições encerradas", async () => {
    expect(await register(draft, main.free, answers("r@exemplo.com"))).toEqual({ error: "EVENT_NOT_FOUND" });
    await asCaller(manager, async (c) => {
      await c.query("select public.change_event_status($1, 'registration_closed')", [main.id]);
      await expect(c.query("select public.register_for_event($1, $2, 1, $3, $4)", [main.id, main.free, answers("f@exemplo.com"), randomUUID()])).rejects.toThrow(
        "REGISTRATION_CLOSED",
      );
    });
  });

  it("recusa versão antiga do formulário e respostas inválidas mesmo chamando a API direto", async () => {
    expect(await register(main.id, main.free, answers("v@exemplo.com"), randomUUID(), 99)).toEqual({ error: "FORM_OUTDATED" });
    expect(await register(main.id, main.free, answers("x@exemplo.com", { campo_falso: "x" }))).toEqual({ error: "INVALID_ANSWERS" });
    expect(await register(main.id, main.free, { email: "y@exemplo.com" })).toEqual({ error: "INVALID_ANSWERS" });
    expect(await register(main.id, main.free, answers("sem-arroba"))).toEqual({ error: "INVALID_ANSWERS" });
    expect(await register(main.id, main.free, { full_name: "", email: "z@exemplo.com" })).toEqual({ error: "INVALID_ANSWERS" });
  });

  it("guarda a versão do formulário usada na inscrição", async () => {
    const result = (await register(main.id, main.free, answers("versao@exemplo.com"))) as { public_token: string };
    const version = await asAdmin(
      async (c) =>
        (await c.query("select f.version from public.registrations r join public.event_forms f on f.id = r.form_id where r.public_token = $1", [result.public_token]))
          .rows[0].version,
    );
    expect(version).toBe(1);
  });
});

describe("capacidade sob concorrência", () => {
  it("20 pedidos simultâneos para 5 vagas: exatamente 5 confirmados, nenhuma vaga a mais", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => register(crowd.id, crowd.free, answers(`p${i}@exemplo.com`))));
    expect(results.filter((r) => "status" in r)).toHaveLength(5);
    expect(results.filter((r) => "error" in r && r.error === "SOLD_OUT")).toHaveLength(15);
    expect(await countActive(crowd.id)).toBe(5);
  });

  it("limite próprio do ingresso também resiste à concorrência e não confunde com a capacidade global", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => register(main.id, main.limited, answers(`lim${i}@exemplo.com`))));
    expect(results.filter((r) => "status" in r)).toHaveLength(2);
    expect(results.filter((r) => "error" in r && r.error === "TICKET_SOLD_OUT")).toHaveLength(8);
    expect(await countActive(main.id, main.limited)).toBe(2);
  });

  it("página pública mostra vagas restantes e ingresso esgotado, sem dados de inscritos", async () => {
    await asCaller(anon, async (c) => {
      const { rows } = await c.query("select public.get_public_event($1, 'lotado') as r", [`insc-a-${orgA.slice(0, 8)}`]);
      expect(rows[0].r.event.remaining).toBe(0);
      expect(JSON.stringify(rows[0].r)).not.toContain("@exemplo.com");
      const p = await c.query("select public.get_public_event($1, 'principal') as r", [`insc-a-${orgA.slice(0, 8)}`]);
      expect(p.rows[0].r.tickets.find((t: { name: string }) => t.name === "Limitado").sold_out).toBe(true);
    });
  });

  it("capacidade não pode ser reduzida abaixo das vagas ocupadas", async () => {
    await asCaller(manager, async (c) => {
      await expect(c.query("update public.events set capacity = 4 where id = $1", [crowd.id])).rejects.toThrow("CAPACITY_BELOW_REGISTRATIONS");
    });
    await asCaller(manager, async (c) => {
      const { rowCount } = await c.query("update public.events set capacity = 6 where id = $1", [crowd.id]);
      expect(rowCount).toBe(1);
    });
  });

  it("ingresso com inscrições não pode ser apagado", async () => {
    await asCaller(manager, async (c) => {
      await expect(c.query("delete from public.ticket_types where id = $1", [crowd.free])).rejects.toMatchObject({ code: "23503" });
    });
  });
});

describe("RLS dos inscritos", () => {
  it("anon não lê a tabela de inscrições nem a função de contagem", async () => {
    await asCaller(anon, async (c) => {
      await expect(c.query("select * from public.registrations")).rejects.toThrow(/permission denied/);
    });
    await asCaller(anon, async (c) => {
      await expect(c.query("select private.active_registrations($1)", [main.id])).rejects.toThrow(/permission denied/);
    });
  });

  it.each([
    ["proprietário", owner],
    ["gestor de eventos", manager],
    ["operador de check-in", checkin],
  ])("%s da organização lê os inscritos", async (_label, caller) => {
    await asCaller(caller, async (c) => {
      const { rows } = await c.query("select count(*)::int n from public.registrations where event_id = $1", [crowd.id]);
      expect(rows[0].n).toBe(5);
    });
  });

  it("visualizador de relatórios e outra organização não leem inscritos", async () => {
    for (const caller of [viewer, ownerB]) {
      await asCaller(caller, async (c) => {
        const { rows } = await c.query("select count(*)::int n from public.registrations");
        expect(rows[0].n).toBe(0);
      });
    }
  });

  it("ninguém grava inscrições direto: insert, update de status e delete são negados", async () => {
    await asCaller(owner, async (c) => {
      await expect(c.query("update public.registrations set status = 'cancelled' where event_id = $1", [crowd.id])).rejects.toThrow(/permission denied/);
    });
    await asCaller(owner, async (c) => {
      await expect(c.query("delete from public.registrations where event_id = $1", [crowd.id])).rejects.toThrow(/permission denied/);
    });
    await asCaller(owner, async (c) => {
      await expect(
        c.query(
          `insert into public.registrations (organization_id, event_id, ticket_type_id, form_id, status, attendee_name, attendee_email, answers, price_cents, public_token, idempotency_key)
           select organization_id, event_id, ticket_type_id, form_id, 'confirmed', 'X', 'x@x.com', '{}', 0, repeat('a', 64), gen_random_uuid() from public.registrations limit 1`,
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

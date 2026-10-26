import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Fase 6: relatório agregado do evento, papéis e isolamento entre organizações.

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL não definida. Rode `npm run db:reset:local` com ela configurada.");
}

const pool = new pg.Pool({ connectionString: url, max: 10 });

type Caller = { role: "authenticated"; userId: string } | { role: "anon" };

async function as<T>(caller: Caller, sql: string, params: unknown[] = []): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query("begin");
    await conn.query(`set local role ${caller.role}`);
    const claims = caller.role === "authenticated" ? JSON.stringify({ sub: caller.userId, role: "authenticated" }) : "";
    await conn.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    const { rows } = await conn.query(sql, params);
    await conn.query("commit");
    return rows as T;
  } catch (error) {
    await conn.query("rollback");
    throw error;
  } finally {
    conn.release();
  }
}

const ids = { ownerA: randomUUID(), managerA: randomUUID(), checkinA: randomUUID(), viewerA: randomUUID(), ownerB: randomUUID() };
const orgA = randomUUID();
const orgB = randomUUID();
const user = (id: string) => ({ role: "authenticated" as const, userId: id });
const anon = { role: "anon" as const };
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

let eventId = "";
let ticketId = "";

const report = (caller: Caller, event = eventId) =>
  as<{ r: Record<string, unknown> & { by_status: unknown; checked_in: number; by_ticket: unknown; daily: { n: number }[]; finance: unknown } }[]>(caller, "select public.event_report($1) as r", [event]).then((rows) => rows[0].r);

async function register(email: string): Promise<{ code: string; id: string }> {
  const [{ r }] = await as<{ r: { public_token: string } }[]>(anon, "select public.register_for_event($1, $2, 1, $3, $4) as r", [
    eventId,
    ticketId,
    { full_name: "Maria Silva", email },
    randomUUID(),
  ]);
  const [{ id, checkin_code }] = await pool
    .query("select id, checkin_code from public.registrations where public_token = $1", [r.public_token])
    .then((res) => res.rows);
  return { id, code: checkin_code };
}

beforeAll(async () => {
  const conn = await pool.connect();
  try {
    for (const [key, id] of Object.entries(ids)) {
      await conn.query("insert into auth.users (id, email) values ($1, $2)", [id, `${key}-${id}@test.local`]);
    }
    await conn.query("insert into public.organizations (id, slug, name, created_by) values ($1, $2, 'Org A', $3), ($4, $5, 'Org B', $6)", [
      orgA, `rep-a-${orgA.slice(0, 8)}`, ids.ownerA, orgB, `rep-b-${orgB.slice(0, 8)}`, ids.ownerB,
    ]);
    await conn.query(
      `insert into public.organization_members (organization_id, user_id, role) values
        ($1, $2, 'owner'), ($1, $3, 'event_manager'), ($1, $4, 'checkin_operator'), ($1, $5, 'report_viewer'), ($6, $7, 'owner')`,
      [orgA, ids.ownerA, ids.managerA, ids.checkinA, ids.viewerA, orgB, ids.ownerB],
    );
  } finally {
    conn.release();
  }
  const [ev] = await as<{ id: string }[]>(
    user(ids.managerA),
    `insert into public.events (organization_id, slug, title, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity, venue_name)
     values ($1, 'relatorio', 'Relatório', $2, $3, $4, $5, 50, 'Auditório') returning id`,
    [orgA, future(30), future(31), future(-1), future(29)],
  );
  eventId = ev.id;
  const [t] = await as<{ id: string }[]>(
    user(ids.managerA),
    "insert into public.ticket_types (organization_id, event_id, name, price_cents, position) values ($1, $2, 'Gratuito', 0, 1) returning id",
    [orgA, eventId],
  );
  ticketId = t.id;
  await as(user(ids.managerA), "select public.change_event_status($1, 'published')", [eventId]);
});

afterAll(async () => {
  const conn = await pool.connect();
  try {
    await conn.query("set session_replication_role = replica");
    for (const table of ["payments", "checkins", "registrations"]) {
      await conn.query(`delete from public.${table} where organization_id = any($1::uuid[])`, [[orgA, orgB]]);
    }
    await conn.query("delete from public.organizations where id = any($1::uuid[])", [[orgA, orgB]]);
    await conn.query("delete from auth.users where id = any($1::uuid[])", [Object.values(ids)]);
    await conn.query("set session_replication_role = origin");
  } finally {
    conn.release();
  }
  await pool.end();
});

describe("relatório do evento", () => {
  it("evento sem inscrições devolve zeros", async () => {
    const r = await report(user(ids.ownerA));
    expect(r).toMatchObject({ capacity: 50, checked_in: 0, by_status: {}, daily: [] });
    expect(r.finance).toMatchObject({ approved_cents: 0, platform_fee_cents: 0, refunded_cents: 0, attention: 0 });
  });

  it("conta inscrições, presença, ingresso e financeiro", async () => {
    const a = await register("a@exemplo.com");
    await register("b@exemplo.com");
    const c = await register("c@exemplo.com");
    await pool.query("update public.registrations set status = 'cancelled' where id = $1", [c.id]);
    await as(user(ids.checkinA), "select public.check_in($1, $2, null)", [eventId, a.code]);
    await pool.query(
      `insert into public.payments (organization_id, event_id, registration_id, external_id, status, amount_cents, currency, platform_fee_cents, attention)
       values ($1, $2, $3, '111', 'approved', 5000, 'BRL', 250, null),
              ($1, $2, $3, '112', 'refunded', 1000, 'BRL', 0, null),
              ($1, $2, $3, '113', 'approved', 700, 'BRL', 0, 'duplicate_payment')`,
      [orgA, eventId, a.id],
    );

    const r = await report(user(ids.viewerA));
    expect(r.by_status).toEqual({ confirmed: 2, cancelled: 1 });
    expect(r.checked_in).toBe(1);
    expect(r.by_ticket).toEqual([{ name: "Gratuito", price_cents: 0, confirmed: 2 }]);
    expect(r.daily).toHaveLength(1);
    expect(r.daily[0].n).toBe(2);
    expect(r.finance).toEqual({ approved_cents: 5700, platform_fee_cents: 250, refunded_cents: 1000, attention: 1 });
  });

  it("não expõe dados pessoais", async () => {
    const text = JSON.stringify(await report(user(ids.ownerA)));
    expect(text).not.toMatch(/exemplo\.com|Maria/);
  });
});

describe("acesso", () => {
  it("equipe financeira lê; operador de check-in, outra organização e anônimo não", async () => {
    for (const id of [ids.ownerA, ids.managerA, ids.viewerA]) await expect(report(user(id))).resolves.toBeTruthy();
    await expect(report(user(ids.checkinA))).rejects.toThrow("FORBIDDEN");
    await expect(report(user(ids.ownerB))).rejects.toThrow("FORBIDDEN");
    await expect(report(user(ids.ownerA), randomUUID())).rejects.toThrow("FORBIDDEN");
    await expect(report(anon)).rejects.toThrow(/permission denied/);
  });
});

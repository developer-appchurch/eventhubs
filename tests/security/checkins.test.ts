import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Fase 5: check-in pelo código do QR ou manual, duplicidade, papéis, evento errado e RLS.

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL não definida. Rode `npm run db:reset:local` com ela configurada.");
}

const pool = new pg.Pool({ connectionString: url, max: 20 });

type Caller = { role: "authenticated"; userId: string } | { role: "anon" };

// Roda como o papel informado e faz COMMIT, para que um check-in seja visto pelo seguinte.
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
const manager = user(ids.managerA);
const operator = user(ids.checkinA);
const anon = { role: "anon" as const };

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

let eventId = "";
let otherEventId = "";
let ticketId = "";
let otherTicketId = "";

async function createEvent(slug: string): Promise<{ id: string; ticket: string }> {
  const [ev] = await as<{ id: string }[]>(
    manager,
    `insert into public.events (organization_id, slug, title, starts_at, ends_at, capacity, venue_name)
     values ($1, $2, $3, $4, $5, 100, 'Auditório') returning id`,
    [orgA, slug, `Evento ${slug}`, future(30), future(31)],
  );
  const [t] = await as<{ id: string }[]>(
    manager,
    "insert into public.ticket_types (organization_id, event_id, name, price_cents, position) values ($1, $2, 'Gratuito', 0, 1) returning id",
    [orgA, ev.id],
  );
  await as(manager, "select public.change_event_status($1, 'published')", [ev.id]);
  return { id: ev.id, ticket: t.id };
}

async function register(event: string, ticket: string, email: string) {
  const [{ r }] = await as<{ r: { public_token: string } }[]>(anon, "select public.register_for_event($1, $2, 1, $3, $4) as r", [
    event,
    ticket,
    { full_name: "Maria Silva", email },
    randomUUID(),
  ]);
  const [{ checkin }] = await as<{ checkin: { checkin_code: string } }[]>(anon, "select public.get_registration($1) as checkin", [r.public_token]);
  return { token: r.public_token, code: checkin.checkin_code };
}

const checkIn = (caller: Caller, event: string, code: string | null, registrationId: string | null = null) =>
  as<{ r: Record<string, unknown> }[]>(caller, "select public.check_in($1, $2, $3) as r", [event, code, registrationId]).then((rows) => rows[0].r);

const registrationId = async (code: string) =>
  (await as<{ id: string }[]>(manager, "select id from public.registrations where checkin_code = $1", [code]))[0].id;

// Cancelamento ainda não tem função própria: simulado direto como superusuário.
const cancel = (code: string) => pool.query("update public.registrations set status = 'cancelled' where checkin_code = $1", [code]);

beforeAll(async () => {
  const conn = await pool.connect();
  try {
    for (const [key, id] of Object.entries(ids)) {
      await conn.query("insert into auth.users (id, email) values ($1, $2)", [id, `${key}-${id}@test.local`]);
    }
    await conn.query("update public.profiles set full_name = 'Operadora Ana' where id = $1", [ids.checkinA]);
    await conn.query("insert into public.organizations (id, slug, name, created_by) values ($1, $2, 'Org A', $3), ($4, $5, 'Org B', $6)", [
      orgA, `chk-a-${orgA.slice(0, 8)}`, ids.ownerA, orgB, `chk-b-${orgB.slice(0, 8)}`, ids.ownerB,
    ]);
    await conn.query(
      `insert into public.organization_members (organization_id, user_id, role) values
        ($1, $2, 'owner'), ($1, $3, 'event_manager'), ($1, $4, 'checkin_operator'), ($1, $5, 'report_viewer'), ($6, $7, 'owner')`,
      [orgA, ids.ownerA, ids.managerA, ids.checkinA, ids.viewerA, orgB, ids.ownerB],
    );
  } finally {
    conn.release();
  }
  ({ id: eventId, ticket: ticketId } = await createEvent("checkin"));
  ({ id: otherEventId, ticket: otherTicketId } = await createEvent("checkin-outro"));
});

afterAll(async () => {
  const conn = await pool.connect();
  try {
    await conn.query("set session_replication_role = replica");
    await conn.query("delete from public.checkins where organization_id = any($1::uuid[])", [[orgA, orgB]]);
    await conn.query("delete from public.registrations where organization_id = any($1::uuid[])", [[orgA, orgB]]);
    await conn.query("delete from public.organizations where id = any($1::uuid[])", [[orgA, orgB]]);
    await conn.query("delete from auth.users where id = any($1::uuid[])", [Object.values(ids)]);
    await conn.query("set session_replication_role = origin");
  } finally {
    conn.release();
  }
  await pool.end();
});

describe("código do QR", () => {
  it("é aleatório, diferente do token público e só aparece para inscrição confirmada", async () => {
    const { token, code } = await register(eventId, ticketId, "qr@exemplo.com");
    expect(code).toMatch(/^[0-9a-f]{32}$/);
    expect(token).not.toContain(code);

    await cancel(code);
    const [{ r }] = await as<{ r: { checkin_code: string | null } }[]>(anon, "select public.get_registration($1) as r", [token]);
    expect(r.checkin_code).toBeNull();
  });
});

describe("check-in", () => {
  it("operador registra pelo QR; a segunda leitura preserva o registro original", async () => {
    const { code } = await register(eventId, ticketId, "ana@exemplo.com");
    const first = await checkIn(operator, eventId, code.toUpperCase());
    expect(first).toMatchObject({ result: "checked_in", attendee_name: "Maria Silva", checked_in_by: "Operadora Ana" });

    const again = await checkIn(manager, eventId, code);
    expect(again).toMatchObject({ result: "already_checked_in", checked_in_at: first.checked_in_at, checked_in_by: "Operadora Ana" });

    const rows = await as<{ method: string }[]>(manager, "select method from public.checkins where registration_id = $1", [await registrationId(code)]);
    expect(rows).toEqual([{ method: "qr" }]);
    const audit = await as<unknown[]>(user(ids.ownerA), "select 1 from public.audit_logs where action = 'registration.checked_in' and target_id = $1", [
      await registrationId(code),
    ]);
    expect(audit).toHaveLength(1);
  });

  it("check-in manual pela inscrição", async () => {
    const { code } = await register(eventId, ticketId, "manual@exemplo.com");
    const result = await checkIn(manager, eventId, null, await registrationId(code));
    expect(result).toMatchObject({ result: "checked_in" });
    const rows = await as<{ method: string }[]>(manager, "select method from public.checkins where registration_id = $1", [await registrationId(code)]);
    expect(rows).toEqual([{ method: "manual" }]);
  });

  it("leituras simultâneas do mesmo QR geram um único check-in", async () => {
    const { code } = await register(eventId, ticketId, "simultaneo@exemplo.com");
    const results = await Promise.all(Array.from({ length: 8 }, () => checkIn(operator, eventId, code)));
    expect(results.filter((r) => r.result === "checked_in")).toHaveLength(1);
    const rows = await as<unknown[]>(manager, "select 1 from public.checkins where registration_id = $1", [await registrationId(code)]);
    expect(rows).toHaveLength(1);
  });

  it("QR inválido ou de outro evento não é encontrado", async () => {
    await expect(checkIn(operator, eventId, "0".repeat(32))).rejects.toThrow("CHECKIN_NOT_FOUND");
    await expect(checkIn(operator, eventId, "'; drop table x; --")).rejects.toThrow("CHECKIN_NOT_FOUND");
    const { code } = await register(otherEventId, otherTicketId, "outro@exemplo.com");
    await expect(checkIn(operator, eventId, code)).rejects.toThrow("CHECKIN_NOT_FOUND");
    await expect(checkIn(operator, eventId, null, null)).rejects.toThrow("CHECKIN_NOT_FOUND");
  });

  it("inscrição não confirmada é recusada", async () => {
    const { code } = await register(eventId, ticketId, "cancelada@exemplo.com");
    await cancel(code);
    await expect(checkIn(operator, eventId, code)).rejects.toThrow("REGISTRATION_NOT_CONFIRMED");
  });

  it("visualizador de relatórios, outra organização e anônimo não fazem check-in", async () => {
    const { code } = await register(eventId, ticketId, "bloqueado@exemplo.com");
    await expect(checkIn(user(ids.viewerA), eventId, code)).rejects.toThrow("FORBIDDEN");
    await expect(checkIn(user(ids.ownerB), eventId, code)).rejects.toThrow("FORBIDDEN");
    await expect(checkIn(anon, eventId, code)).rejects.toThrow(/permission denied/);
  });

  it("evento cancelado não aceita check-in", async () => {
    const { id, ticket } = await createEvent("checkin-cancelado");
    const { code } = await register(id, ticket, "c@exemplo.com");
    await as(manager, "select public.change_event_status($1, 'cancelled')", [id]);
    await expect(checkIn(operator, id, code)).rejects.toThrow("CHECKIN_UNAVAILABLE");
  });
});

describe("desfazer check-in", () => {
  const undo = (caller: Caller, registration: string) => as(caller, "select public.undo_check_in($1)", [registration]);

  it("operador desfaz, a pessoa volta a pendente e pode fazer check-in de novo; fica na auditoria", async () => {
    const { code } = await register(eventId, ticketId, "desfazer@exemplo.com");
    const id = await registrationId(code);
    await checkIn(operator, eventId, code);
    await undo(operator, id);
    expect(await as<unknown[]>(manager, "select 1 from public.checkins where registration_id = $1", [id])).toEqual([]);
    await undo(operator, id); // sem check-in: não faz nada
    expect(await checkIn(operator, eventId, code)).toMatchObject({ result: "checked_in" });
    const audit = await as<unknown[]>(user(ids.ownerA), "select 1 from public.audit_logs where action = 'registration.check_in_undone' and target_id = $1", [id]);
    expect(audit).toHaveLength(1);
  });

  it("visualizador, outra organização e anônimo não desfazem", async () => {
    const { code } = await register(eventId, ticketId, "desfazer-bloqueado@exemplo.com");
    const id = await registrationId(code);
    await checkIn(operator, eventId, code);
    await expect(undo(user(ids.viewerA), id)).rejects.toThrow("FORBIDDEN");
    await expect(undo(user(ids.ownerB), id)).rejects.toThrow("FORBIDDEN");
    await expect(undo(anon, id)).rejects.toThrow(/permission denied/);
    expect(await as<unknown[]>(manager, "select 1 from public.checkins where registration_id = $1", [id])).toHaveLength(1);
  });
});

describe("RLS de checkins", () => {
  it("equipe do evento lê; visualizador e outra organização não; ninguém escreve direto", async () => {
    expect((await as<unknown[]>(operator, "select 1 from public.checkins where event_id = $1", [eventId])).length).toBeGreaterThan(0);
    expect(await as<unknown[]>(user(ids.viewerA), "select 1 from public.checkins where event_id = $1", [eventId])).toEqual([]);
    expect(await as<unknown[]>(user(ids.ownerB), "select 1 from public.checkins where event_id = $1", [eventId])).toEqual([]);
    await expect(as(anon, "select 1 from public.checkins")).rejects.toThrow(/permission denied/);
    await expect(
      as(operator, "delete from public.checkins where event_id = $1", [eventId]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(operator, "update public.checkins set checked_in_at = now() where event_id = $1", [eventId]),
    ).rejects.toThrow(/permission denied/);
  });
});

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// E-mail de confirmação: um por inscrição, retentativa só depois de falha, só o servidor.

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL não definida. Rode `npm run db:reset:local` com ela configurada.");
}

const pool = new pg.Pool({ connectionString: url, max: 10 });

async function as<T = Record<string, unknown>>(role: "anon" | "authenticated" | "service_role", sql: string, params: unknown[] = [], sub?: string) {
  const conn = await pool.connect();
  try {
    await conn.query("begin");
    await conn.query(`set local role ${role}`);
    await conn.query("select set_config('request.jwt.claims', $1, true)", [sub ? JSON.stringify({ sub, role }) : ""]);
    const { rows } = await conn.query(sql, params);
    await conn.query("commit");
    return rows as T[];
  } catch (error) {
    await conn.query("rollback");
    throw error;
  } finally {
    conn.release();
  }
}

const owner = randomUUID();
const viewer = randomUUID();
const org = randomUUID();
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
let eventId = "";
let ticketId = "";

const register = async (email: string) => {
  const [{ r }] = await as<{ r: { public_token: string } }>("anon", "select public.register_for_event($1, $2, 1, $3, $4) as r", [
    eventId, ticketId, { full_name: "Maria <b>Silva</b>", email }, randomUUID(),
  ]);
  return r.public_token;
};
const claim = (token: string) =>
  as<{ c: { notification_id: string; checkin_code: string; attendee_email: string } | null }>("service_role", "select public.claim_confirmation_email(null, $1) as c", [token]).then(
    (rows) => rows[0].c,
  );
const finish = (id: string, error: string | null) =>
  as("service_role", "select public.finish_confirmation_email($1, $2, $3)", [id, error ? null : "msg-1", error]);

beforeAll(async () => {
  await pool.query("insert into auth.users (id, email) values ($1, $2), ($3, $4)", [owner, `o-${owner}@t.local`, viewer, `v-${viewer}@t.local`]);
  await pool.query("insert into public.organizations (id, slug, name, created_by) values ($1, $2, 'Org', $3)", [org, `mail-${org.slice(0, 8)}`, owner]);
  await pool.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'report_viewer')", [org, owner, viewer]);
  const [ev] = await as<{ id: string }>(
    "authenticated",
    `insert into public.events (organization_id, slug, title, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity, venue_name)
     values ($1, 'email', 'Evento', $2, $3, $4, $5, 10, 'Auditório') returning id`,
    [org, future(30), future(31), future(-1), future(29)],
    owner,
  );
  eventId = ev.id;
  const [t] = await as<{ id: string }>(
    "authenticated",
    "insert into public.ticket_types (organization_id, event_id, name, price_cents, position) values ($1, $2, 'Gratuito', 0, 1) returning id",
    [org, eventId],
    owner,
  );
  ticketId = t.id;
  await as("authenticated", "select public.change_event_status($1, 'published')", [eventId], owner);
});

afterAll(async () => {
  await pool.query("set session_replication_role = replica");
  await pool.query("delete from public.notifications where organization_id = $1", [org]);
  await pool.query("delete from public.registrations where organization_id = $1", [org]);
  await pool.query("delete from public.organizations where id = $1", [org]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [[owner, viewer]]);
  await pool.query("set session_replication_role = origin");
  await pool.end();
});

describe("e-mail de confirmação", () => {
  it("sai uma vez; repetição ou envio em andamento não reenviam", async () => {
    const token = await register("uma@exemplo.com");
    const first = await claim(token);
    expect(first).toMatchObject({ attendee_email: "uma@exemplo.com", checkin_code: expect.stringMatching(/^[0-9a-f]{32}$/) });
    expect(await claim(token)).toBeNull();
    await finish(first!.notification_id, null);
    expect(await claim(token)).toBeNull();
    const { rows } = await pool.query("select status, attempts, sent_at from public.notifications where id = $1", [first!.notification_id]);
    expect(rows[0]).toMatchObject({ status: "sent", attempts: 1 });
    expect(rows[0].sent_at).not.toBeNull();
  });

  it("depois de uma falha, a próxima tentativa envia de novo", async () => {
    const token = await register("falha@exemplo.com");
    const first = await claim(token);
    await finish(first!.notification_id, "Resend HTTP 500");
    const retry = await claim(token);
    expect(retry?.notification_id).toBe(first!.notification_id);
    const { rows } = await pool.query("select status, attempts, last_error from public.notifications where id = $1", [first!.notification_id]);
    expect(rows[0]).toMatchObject({ status: "sending", attempts: 2, last_error: null });
  });

  it("inscrição não confirmada não gera e-mail", async () => {
    const token = await register("cancelada@exemplo.com");
    await pool.query("update public.registrations set status = 'cancelled' where public_token = $1", [token]);
    expect(await claim(token)).toBeNull();
    expect(await claim("0".repeat(64))).toBeNull();
  });

  it("só o servidor reserva e conclui envios; a equipe com acesso aos inscritos lê o estado", async () => {
    const token = await register("permissao@exemplo.com");
    await expect(as("anon", "select public.claim_confirmation_email(null, $1)", [token])).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", "select public.claim_confirmation_email(null, $1)", [token], owner)).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", "select public.finish_confirmation_email($1, null, null)", [randomUUID()], owner)).rejects.toThrow(/permission denied/);
    expect((await as("authenticated", "select 1 from public.notifications where organization_id = $1", [org], owner)).length).toBeGreaterThan(0);
    expect(await as("authenticated", "select 1 from public.notifications where organization_id = $1", [org], viewer)).toEqual([]);
    await expect(as("authenticated", "delete from public.notifications where organization_id = $1", [org], owner)).rejects.toThrow(/permission denied/);
  });
});

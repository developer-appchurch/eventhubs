import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Fase 4: reserva com prazo, conta conectada, reconciliação de pagamentos e permissões.
// O Mercado Pago não é chamado aqui: o servidor consulta o pagamento e entrega o estado atual
// a record_payment, que é o que estes testes exercitam.

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL não definida. Rode `npm run db:reset:local` com ela configurada.");
}

const pool = new pg.Pool({ connectionString: url, max: 30 });

type Caller = { role: "authenticated"; userId: string } | { role: "anon" } | { role: "service_role" };

async function as<T = Record<string, unknown>>(caller: Caller, sql: string, params: unknown[] = []): Promise<T[]> {
  const conn = await pool.connect();
  try {
    await conn.query("begin");
    await conn.query(`set local role ${caller.role}`);
    const claims = caller.role === "authenticated" ? JSON.stringify({ sub: caller.userId, role: "authenticated" }) : "";
    await conn.query("select set_config('request.jwt.claims', $1, true)", [claims]);
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

const ids = { ownerA: randomUUID(), managerA: randomUUID(), checkinA: randomUUID(), viewerA: randomUUID(), ownerB: randomUUID() };
const orgA = randomUUID();
const orgB = randomUUID();
const user = (id: string) => ({ role: "authenticated" as const, userId: id });
const manager = user(ids.managerA);
const anon = { role: "anon" as const };
const service = { role: "service_role" as const };
const SELLER = "123456789";

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function createEvent(slug: string, capacity: number): Promise<{ id: string; free: string; paid: string }> {
  const [ev] = await as<{ id: string }>(
    manager,
    `insert into public.events (organization_id, slug, title, starts_at, ends_at, capacity, venue_name)
     values ($1, $2, $3, $4, $5, $6, 'Auditório') returning id`,
    [orgA, slug, `Evento ${slug}`, future(30), future(31), capacity],
  );
  const t = await as<{ id: string; name: string }>(
    manager,
    `insert into public.ticket_types (organization_id, event_id, name, price_cents, min_per_order, max_per_order, position)
     values ($1, $2, 'Livre', 0, 2, 3, 1), ($1, $2, 'Pago', 0, 1, 3, 2) returning id, name`,
    [orgA, ev.id],
  );
  const by = Object.fromEntries(t.map((r) => [r.name, r.id]));
  await as(manager, "select public.change_event_status($1, 'published')", [ev.id]);
  await as(manager, "update public.ticket_types set price_cents = 5000 where id = $1", [by.Pago]);
  return { id: ev.id, free: by.Livre, paid: by.Pago };
}

const person = (email: string) => ({ full_name: "Maria Silva", email });
const group = (event: string, ticket: string, emails: string[], key: string = randomUUID()) =>
  as<{ r: { public_token: string; status: string; tokens: string[] } }>(anon, "select public.register_group_for_event($1, $2, 1, $3::jsonb, $4) as r", [
    event, ticket, JSON.stringify(emails.map(person)), key,
  ]).then((rows) => rows[0].r);
const count = async (event: string) => Number((await pool.query("select count(*) from public.registrations where event_id = $1", [event])).rows[0].count);
const checkout = async (token: string) =>
  (await as<{ c: { registration_id: string; payable: boolean; price_cents: number; quantity: number } }>(service, "select public.checkout_context($1) as c", [token]))[0].c;

beforeAll(async () => {
  for (const [key, id] of Object.entries(ids)) {
    await pool.query("insert into auth.users (id, email) values ($1, $2)", [id, `${key}-${id}@test.local`]);
  }
  await pool.query("insert into public.organizations (id, slug, name, created_by) values ($1, $2, 'Org A', $3), ($4, $5, 'Org B', $6)", [
    orgA, `pay-a-${orgA.slice(0, 8)}`, ids.ownerA, orgB, `pay-b-${orgB.slice(0, 8)}`, ids.ownerB,
  ]);
  await pool.query(
    `insert into public.organization_members (organization_id, user_id, role) values
      ($1, $2, 'owner'), ($1, $3, 'event_manager'), ($1, $4, 'checkin_operator'), ($1, $5, 'report_viewer'), ($6, $7, 'owner')`,
    [orgA, ids.ownerA, ids.managerA, ids.checkinA, ids.viewerA, orgB, ids.ownerB],
  );
});

afterAll(async () => {
  await pool.query("set session_replication_role = replica");
  await pool.query("delete from public.payments where organization_id = any($1::uuid[])", [[orgA, orgB]]);
  await pool.query("delete from public.registrations where organization_id = any($1::uuid[])", [[orgA, orgB]]);
  await pool.query("delete from private.payment_accounts where organization_id = any($1::uuid[])", [[orgA, orgB]]);
  await pool.query("delete from public.organizations where id = any($1::uuid[])", [[orgA, orgB]]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [Object.values(ids)]);
  await pool.query("delete from public.payment_events where notification_id like 'teste-%'");
  await pool.query("set session_replication_role = origin");
  await pool.end();
});

const registrationStatus = async (id: string) => (await pool.query("select status from public.registrations where id = $1", [id])).rows[0].status as string;
const SAVE = "select public.save_payment_account($1, $2, 'APP_USR-pub', 'v1.cifrado', 'v1.cifrado', now() + interval '180 days', false, $3)";
let nextPay = 5000;
const pay = (lead: string, status: string, amount: number) =>
  as<{ r: { result: string; registration_ids: string[] } }>(service, "select public.record_payment($1, $2, $3, $4, 'detalhe', $5, 'BRL') as r", [
    lead, SELLER, String(nextPay++), status, amount,
  ]).then((rows) => rows[0].r);

describe("inscrição em grupo", () => {
  it("grupo gratuito: inscrições confirmadas com group_id da principal e replay idempotente", async () => {
    const ev = await createEvent("grupo-livre", 20);
    const key = randomUUID();
    const r = await group(ev.id, ev.free, ["g1@exemplo.com", "g2@exemplo.com"], key);
    expect(r.tokens).toHaveLength(2);
    expect(r.public_token).toBe(r.tokens[0]);
    const { rows } = await pool.query("select id, status, group_id, public_token from public.registrations where event_id = $1 order by created_at, id", [ev.id]);
    expect(rows).toHaveLength(2);
    const lead = rows.find((x) => x.public_token === r.tokens[0]);
    expect(rows.map((x) => x.status)).toEqual(["confirmed", "confirmed"]);
    expect(rows.map((x) => x.group_id)).toEqual([lead.id, lead.id]);

    const again = await group(ev.id, ev.free, ["g1@exemplo.com", "g2@exemplo.com"], key);
    expect(again.tokens).toEqual(r.tokens);
    expect(await count(ev.id)).toBe(2);
  });

  it("quantidade fora de min/max é recusada sem gravar", async () => {
    const ev = await createEvent("grupo-qtd", 20);
    await expect(group(ev.id, ev.free, ["a@exemplo.com"])).rejects.toThrow("INVALID_QUANTITY");
    await expect(group(ev.id, ev.free, ["a@exemplo.com", "b@exemplo.com", "c@exemplo.com", "d@exemplo.com"])).rejects.toThrow("INVALID_QUANTITY");
    expect(await count(ev.id)).toBe(0);
  });

  it("e-mail repetido no grupo é recusado e nada é gravado", async () => {
    const ev = await createEvent("grupo-dup", 20);
    await expect(group(ev.id, ev.free, ["x@exemplo.com", "x@exemplo.com"])).rejects.toThrow("ALREADY_REGISTERED");
    expect(await count(ev.id)).toBe(0);
  });

  it("grupo pago: só a principal paga o total; pagamento confirma todas", async () => {
    await as(service, SAVE, [orgA, SELLER, ids.ownerA]);
    const ev = await createEvent("grupo-pago", 20);
    const r = await group(ev.id, ev.paid, ["p1@exemplo.com", "p2@exemplo.com"]);
    expect(r.status).toBe("pending_payment");
    const lead = await checkout(r.tokens[0]);
    const second = await checkout(r.tokens[1]);
    expect(lead).toMatchObject({ payable: true, price_cents: 10000, quantity: 2 });
    expect(second).toMatchObject({ payable: false, price_cents: 10000, quantity: 2 });
    await as(service, "select public.set_checkout($1, 'https://www.mercadopago.com.br/checkout/x', 250, $2)", [lead.registration_id, SELLER]);

    expect((await pay(lead.registration_id, "approved", 5000)).result).toBe("amount_mismatch");
    expect(await registrationStatus(lead.registration_id)).toBe("pending_payment");

    const ok = await pay(lead.registration_id, "approved", 10000);
    expect(ok.result).toBe("confirmed");
    expect(ok.registration_ids).toHaveLength(2);
    const { rows } = await pool.query("select status from public.registrations where event_id = $1", [ev.id]);
    expect(rows.map((x) => x.status)).toEqual(["confirmed", "confirmed"]);
  });

  it("inscrição individual por register_group_for_event não tem group_id", async () => {
    const ev = await createEvent("grupo-solo", 20);
    const r = await group(ev.id, ev.paid, ["s@exemplo.com"]);
    expect(r.tokens).toHaveLength(1);
    const { rows } = await pool.query("select group_id from public.registrations where event_id = $1", [ev.id]);
    expect(rows).toEqual([{ group_id: null }]);
    expect(await checkout(r.tokens[0])).toMatchObject({ payable: true, price_cents: 5000, quantity: 1 });
  });
});

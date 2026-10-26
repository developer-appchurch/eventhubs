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

async function createEvent(slug: string, capacity: number): Promise<{ id: string; paid: string }> {
  const [ev] = await as<{ id: string }>(
    manager,
    `insert into public.events (organization_id, slug, title, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity, venue_name)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'Auditório') returning id`,
    [orgA, slug, `Evento ${slug}`, future(30), future(31), future(-1), future(29), capacity],
  );
  const [t] = await as<{ id: string }>(
    manager,
    "insert into public.ticket_types (organization_id, event_id, name, price_cents, position) values ($1, $2, 'Inteira', 5000, 1) returning id",
    [orgA, ev.id],
  );
  await as(manager, "select public.change_event_status($1, 'published')", [ev.id]);
  return { id: ev.id, paid: t.id };
}

// Inscrição anônima com checkout criado (como faz o servidor). Devolve id, token e status.
async function reserve(event: { id: string; paid: string }, email: string) {
  const [{ r }] = await as<{ r: { public_token: string; status: string } }>(
    anon,
    "select public.register_for_event($1, $2, 1, $3, $4) as r",
    [event.id, event.paid, { full_name: "Maria Silva", email }, randomUUID()],
  );
  const [{ c }] = await as<{ c: { registration_id: string } }>(service, "select public.checkout_context($1) as c", [r.public_token]);
  await as(service, "select public.set_checkout($1, 'https://www.mercadopago.com.br/checkout/x', 250, $2)", [c.registration_id, SELLER]);
  return { id: c.registration_id, token: r.public_token, status: r.status };
}

let nextPaymentId = 1000;
const record = (registration: string, status: string, opts: { external?: string; amount?: number; seller?: string } = {}) =>
  as<{ r: { result: string } }>(service, "select public.record_payment($1, $2, $3, $4, 'detalhe', $5, 'BRL') as r", [
    registration,
    opts.seller ?? SELLER,
    opts.external ?? String(nextPaymentId++),
    status,
    opts.amount ?? 5000,
  ]).then((rows) => rows[0].r.result);

const registrationStatus = async (id: string) => (await pool.query("select status from public.registrations where id = $1", [id])).rows[0].status as string;
const expire = (id: string) => pool.query("update public.registrations set expires_at = now() - interval '1 minute' where id = $1", [id]);

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

describe("conta conectada", () => {
  it("sem conta, ingresso pago é recusado", async () => {
    const event = await createEvent("sem-conta", 10);
    await expect(
      as(anon, "select public.register_for_event($1, $2, 1, $3, $4)", [event.id, event.paid, { full_name: "Ana", email: "a@exemplo.com" }, randomUUID()]),
    ).rejects.toThrow("PAID_TICKET");
  });

  it("só o servidor grava e lê tokens; owner vê a situação sem tokens", async () => {
    const save = "select public.save_payment_account($1, $2, 'APP_USR-pub', 'v1.cifrado', 'v1.cifrado', now() + interval '180 days', false, $3)";
    for (const caller of [anon, user(ids.ownerA)]) {
      await expect(as(caller, save, [orgA, SELLER, ids.ownerA])).rejects.toThrow(/permission denied/);
      await expect(as(caller, "select public.get_payment_account($1)", [orgA])).rejects.toThrow(/permission denied/);
      await expect(as(caller, "select public.record_payment($1, '1', '1', 'approved', '', 1, 'BRL')", [randomUUID()])).rejects.toThrow(/permission denied/);
      await expect(as(caller, "select public.checkout_context($1)", ["0".repeat(64)])).rejects.toThrow(/permission denied/);
    }
    await expect(as(user(ids.ownerA), "select * from private.payment_accounts")).rejects.toThrow(/permission denied/);

    await as(service, save, [orgA, SELLER, ids.ownerA]);
    const [{ s }] = await as<{ s: Record<string, unknown> }>(user(ids.ownerA), "select public.payment_account_status($1) as s", [orgA]);
    expect(s).toMatchObject({ provider_user_id: SELLER, live_mode: false });
    expect(JSON.stringify(s)).not.toContain("cifrado");
    expect((await as<{ s: unknown }>(manager, "select public.payment_account_status($1) as s", [orgA]))[0].s).toBeNull();
    expect((await as<{ s: unknown }>(user(ids.ownerB), "select public.payment_account_status($1) as s", [orgA]))[0].s).toBeNull();

    const audit = await as(user(ids.ownerA), "select 1 from public.audit_logs where organization_id = $1 and action = 'payments.connected'", [orgA]);
    expect(audit).toHaveLength(1);
  });
});

describe("reserva", () => {
  it("ingresso pago cria reserva de 30 minutos que ocupa a vaga", async () => {
    const event = await createEvent("reserva", 1);
    const first = await reserve(event, "primeira@exemplo.com");
    expect(first.status).toBe("pending_payment");
    const { rows } = await pool.query("select extract(epoch from expires_at - now()) as s from public.registrations where id = $1", [first.id]);
    expect(Number(rows[0].s)).toBeGreaterThan(29 * 60);
    expect(Number(rows[0].s)).toBeLessThanOrEqual(30 * 60);

    await expect(reserve(event, "segunda@exemplo.com")).rejects.toThrow("SOLD_OUT");

    // Vencida, a reserva libera a vaga e é marcada como expirada na inscrição seguinte.
    await expire(first.id);
    const [{ r }] = await as<{ r: { status: string } }>(anon, "select public.get_registration($1) as r", [first.token]);
    expect(r.status).toBe("expired");
    await reserve(event, "segunda@exemplo.com");
    expect(await registrationStatus(first.id)).toBe("expired");
  });

  it("reservas simultâneas pela última vaga: só uma passa", async () => {
    const event = await createEvent("reserva-concorrente", 1);
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => reserve(event, `c${i}@exemplo.com`)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("record_payment", () => {
  it("aprovado confirma; repetir a notificação não muda nada", async () => {
    const event = await createEvent("aprovado", 10);
    const reg = await reserve(event, "aprovado@exemplo.com");
    expect(await record(reg.id, "pending", { external: "5001" })).toBe("recorded");
    expect(await registrationStatus(reg.id)).toBe("pending_payment");
    expect(await record(reg.id, "approved", { external: "5001" })).toBe("confirmed");
    expect(await record(reg.id, "approved", { external: "5001" })).toBe("already_confirmed");
    expect(await registrationStatus(reg.id)).toBe("confirmed");

    // Notificação antiga processada depois: estado em andamento não sobrescreve o aprovado.
    await record(reg.id, "pending", { external: "5001" });
    const { rows } = await pool.query("select status, platform_fee_cents, approved_at from public.payments where external_id = '5001'");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "approved", platform_fee_cents: 250 });
    expect(rows[0].approved_at).not.toBeNull();
  });

  it("valor divergente não confirma e fica para análise", async () => {
    const event = await createEvent("divergente", 10);
    const reg = await reserve(event, "divergente@exemplo.com");
    expect(await record(reg.id, "approved", { amount: 100 })).toBe("amount_mismatch");
    expect(await registrationStatus(reg.id)).toBe("pending_payment");
  });

  it("vendedor diferente, referência desconhecida ou pagamento de outra inscrição são recusados", async () => {
    const event = await createEvent("recusas", 10);
    const reg = await reserve(event, "recusa@exemplo.com");
    const other = await reserve(event, "outra@exemplo.com");
    await expect(record(reg.id, "approved", { seller: "999" })).rejects.toThrow("SELLER_MISMATCH");
    await expect(record(randomUUID(), "approved")).rejects.toThrow("UNKNOWN_REFERENCE");
    await record(reg.id, "pending", { external: "6001" });
    await expect(record(other.id, "approved", { external: "6001" })).rejects.toThrow("REFERENCE_MISMATCH");
  });

  it("aprovado depois de a reserva vencer: confirma se ainda houver vaga", async () => {
    const event = await createEvent("atrasado-com-vaga", 10);
    const reg = await reserve(event, "atrasado@exemplo.com");
    await expire(reg.id);
    expect(await record(reg.id, "approved")).toBe("confirmed_late");
    expect(await registrationStatus(reg.id)).toBe("confirmed");
  });

  it("aprovado depois de a vaga ir para outra pessoa: não confirma e pede reembolso", async () => {
    const event = await createEvent("atrasado-sem-vaga", 1);
    const late = await reserve(event, "atrasado@exemplo.com");
    await expire(late.id);
    const winner = await reserve(event, "vencedor@exemplo.com");
    expect(await record(winner.id, "approved")).toBe("confirmed");
    expect(await record(late.id, "approved")).toBe("paid_without_seat");
    expect(await registrationStatus(late.id)).toBe("expired");
    const confirmed = await pool.query("select count(*)::int n from public.registrations where event_id = $1 and status = 'confirmed'", [event.id]);
    expect(confirmed.rows[0].n).toBe(1);
  });

  it("segundo pagamento aprovado da mesma inscrição é marcado como duplicado", async () => {
    const event = await createEvent("duplicado", 10);
    const reg = await reserve(event, "duplicado@exemplo.com");
    expect(await record(reg.id, "approved")).toBe("confirmed");
    expect(await record(reg.id, "approved")).toBe("duplicate_payment");
  });

  it("reembolso ou chargeback do pagamento que confirmou marca a inscrição como reembolsada", async () => {
    const event = await createEvent("reembolso", 10);
    const reg = await reserve(event, "reembolso@exemplo.com");
    await record(reg.id, "approved", { external: "7001" });
    expect(await record(reg.id, "refunded", { external: "7001" })).toBe("refunded");
    expect(await registrationStatus(reg.id)).toBe("refunded");
  });
});

describe("notificações e leitura", () => {
  it("a mesma notificação só é processada uma vez", async () => {
    const begin = "select public.begin_payment_event('teste-1', 'payment', '1') as ok";
    expect((await as<{ ok: boolean }>(service, begin))[0].ok).toBe(true);
    // Falhou antes de terminar: a nova tentativa processa de novo.
    expect((await as<{ ok: boolean }>(service, begin))[0].ok).toBe(true);
    await as(service, "select public.finish_payment_event('teste-1', 'confirmed', $1)", [orgA]);
    expect((await as<{ ok: boolean }>(service, begin))[0].ok).toBe(false);
    await expect(as(anon, begin)).rejects.toThrow(/permission denied/);
  });

  it("pagamentos: financeiro da organização lê; operador de check-in e outra organização não", async () => {
    const event = await createEvent("leitura", 10);
    const reg = await reserve(event, "leitura@exemplo.com");
    await record(reg.id, "approved");
    const read = (caller: Caller) => as(caller, "select 1 from public.payments where event_id = $1", [event.id]);
    expect(await read(user(ids.ownerA))).toHaveLength(1);
    expect(await read(manager)).toHaveLength(1);
    expect(await read(user(ids.viewerA))).toHaveLength(1);
    expect(await read(user(ids.checkinA))).toHaveLength(0);
    expect(await read(user(ids.ownerB))).toHaveLength(0);
    await expect(read(anon)).rejects.toThrow(/permission denied/);
    await expect(as(user(ids.ownerA), "update public.payments set status = 'approved' where event_id = $1", [event.id])).rejects.toThrow(/permission denied/);
    await expect(as(user(ids.ownerA), "select 1 from public.payment_events")).rejects.toThrow(/permission denied/);
  });
});

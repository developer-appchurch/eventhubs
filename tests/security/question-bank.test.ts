import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Banco de perguntas: isolamento entre organizações, papéis e perguntas "sempre" em novos
// eventos. Mesmo padrão de events-rls.test.ts (transação com papel/JWT e ROLLBACK).

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL não definida. Rode `npm run db:reset:local` com ela configurada.");

const pool = new pg.Pool({ connectionString: url, max: 4 });

async function as<T>(userId: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query("begin");
    await conn.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await conn.query("select set_config('request.jwt.claims', $1, true)", [userId ? JSON.stringify({ sub: userId, role: "authenticated" }) : ""]);
    return await fn(conn);
  } finally {
    await conn.query("rollback");
    conn.release();
  }
}

const ids = { ownerA: randomUUID(), managerA: randomUUID(), viewerA: randomUUID(), ownerB: randomUUID() };
const orgA = randomUUID();
const orgB = randomUUID();
const qAlways = randomUUID();
const qOptional = randomUUID();
const qB = randomUUID();
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

beforeAll(async () => {
  const c = await pool.connect();
  try {
    for (const [key, id] of Object.entries(ids)) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, `${key}-${id}@test.local`]);
    }
    await c.query("insert into public.organizations (id, slug, name, created_by) values ($1, $2, 'Org A', $3), ($4, $5, 'Org B', $6)", [
      orgA, `banco-a-${orgA.slice(0, 8)}`, ids.ownerA, orgB, `banco-b-${orgB.slice(0, 8)}`, ids.ownerB,
    ]);
    await c.query(
      `insert into public.organization_members (organization_id, user_id, role) values
        ($1, $2, 'owner'), ($1, $3, 'event_manager'), ($1, $4, 'report_viewer'), ($5, $6, 'owner')`,
      [orgA, ids.ownerA, ids.managerA, ids.viewerA, orgB, ids.ownerB],
    );
    await c.query(
      `insert into public.question_bank (id, organization_id, label, type, required, always_on) values
        ($1, $2, 'CPF', 'short_text', true, true), ($3, $2, 'Célula', 'short_text', false, false), ($4, $5, 'Segredo B', 'short_text', false, false)`,
      [qAlways, orgA, qOptional, qB, orgB],
    );
  } finally {
    c.release();
  }
});

afterAll(async () => {
  const c = await pool.connect();
  try {
    await c.query("set session_replication_role = replica");
    await c.query("delete from public.organizations where id = any($1::uuid[])", [[orgA, orgB]]);
    await c.query("delete from auth.users where id = any($1::uuid[])", [Object.values(ids)]);
  } finally {
    c.release();
  }
  await pool.end();
});

describe("question_bank RLS", () => {
  it("membro só vê perguntas da própria organização", async () => {
    const rows = await as(ids.viewerA, async (c) => (await c.query("select id from public.question_bank")).rows.map((r) => r.id));
    expect(rows.sort()).toEqual([qAlways, qOptional].sort());
    const rowsB = await as(ids.ownerB, async (c) => (await c.query("select id from public.question_bank")).rows.map((r) => r.id));
    expect(rowsB).toEqual([qB]);
  });

  it("anon não lê o banco", async () => {
    await expect(as(null, (c) => c.query("select id from public.question_bank"))).rejects.toThrow(/permission denied/);
  });

  it("gestor de eventos cria, edita e apaga na própria organização", async () => {
    await as(ids.managerA, async (c) => {
      const { rows } = await c.query("insert into public.question_bank (organization_id, label, type) values ($1, 'RG', 'short_text') returning id", [orgA]);
      expect(rows).toHaveLength(1);
      expect((await c.query("update public.question_bank set required = true where id = $1", [qOptional])).rowCount).toBe(1);
      expect((await c.query("delete from public.question_bank where id = $1", [qOptional])).rowCount).toBe(1);
    });
  });

  it("não escreve no banco de outra organização", async () => {
    await expect(
      as(ids.managerA, (c) => c.query("insert into public.question_bank (organization_id, label, type) values ($1, 'X', 'short_text')", [orgB])),
    ).rejects.toThrow(/row-level security/);
    await as(ids.ownerA, async (c) => {
      expect((await c.query("update public.question_bank set label = 'X' where id = $1", [qB])).rowCount).toBe(0);
      expect((await c.query("delete from public.question_bank where id = $1", [qB])).rowCount).toBe(0);
    });
  });

  it("papel sem gestão de eventos não escreve", async () => {
    await expect(
      as(ids.viewerA, (c) => c.query("insert into public.question_bank (organization_id, label, type) values ($1, 'X', 'short_text')", [orgA])),
    ).rejects.toThrow(/row-level security/);
    await as(ids.viewerA, async (c) => {
      expect((await c.query("delete from public.question_bank where id = $1", [qAlways])).rowCount).toBe(0);
    });
  });

  it("não move pergunta para outra organização nem aceita nome/e-mail ou 'sempre' opcional", async () => {
    await expect(as(ids.ownerA, (c) => c.query("update public.question_bank set organization_id = $1 where id = $2", [orgB, qAlways]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      as(ids.ownerA, (c) => c.query("insert into public.question_bank (organization_id, label, type) values ($1, 'Nome', 'name')", [orgA])),
    ).rejects.toThrow(/check constraint/);
    await expect(
      as(ids.ownerA, (c) => c.query("insert into public.question_bank (organization_id, label, type, always_on) values ($1, 'X', 'short_text', true)", [orgA])),
    ).rejects.toThrow(/question_bank_always_on_required/);
  });
});

describe("perguntas 'sempre' em novos eventos", () => {
  it("evento novo nasce com as perguntas 'sempre' da própria organização, na versão 1", async () => {
    await as(ids.managerA, async (c) => {
      const { rows } = await c.query(
        `insert into public.events (organization_id, slug, title, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity)
         values ($1, 'com-banco', 'Evento com banco', $2, $3, $4, $5, 10) returning id`,
        [orgA, future(30), future(31), future(-1), future(29)],
      );
      const fields = await c.query("select key, required, is_active from public.form_fields where event_id = $1 order by position", [rows[0].id]);
      expect(fields.rows.map((r) => r.key)).toEqual(["full_name", "email", `q_${qAlways.replace(/-/g, "")}`]);
      expect(fields.rows[2]).toMatchObject({ required: true, is_active: true });
      const form = await c.query("select version, fields from public.event_forms where event_id = $1", [rows[0].id]);
      expect(form.rows).toHaveLength(1);
      expect(form.rows[0].fields.map((f: { label: string }) => f.label)).toEqual(["Nome completo", "E-mail", "CPF"]);
    });
  });

  it("organização sem banco mantém o formulário padrão", async () => {
    await as(ids.ownerB, async (c) => {
      const { rows } = await c.query(
        `insert into public.events (organization_id, slug, title, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity)
         values ($1, 'sem-sempre', 'Evento B', $2, $3, $4, $5, 10) returning id`,
        [orgB, future(30), future(31), future(-1), future(29)],
      );
      const fields = await c.query("select key from public.form_fields where event_id = $1 order by position", [rows[0].id]);
      expect(fields.rows.map((r) => r.key)).toEqual(["full_name", "email"]);
    });
  });
});

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Capas no Storage: só gerente da própria organização envia/descarta, e pasta fora do padrão
// é negada (RLS), não vira erro de conversão.

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL não definida. Rode `npm run db:reset:local` com ela configurada.");
}

const pool = new pg.Pool({ connectionString: url, max: 3 });
const ids = { manager: randomUUID(), viewer: randomUUID(), other: randomUUID() };
const orgA = randomUUID();
const orgB = randomUUID();

async function asUser<T>(userId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query("begin");
    await conn.query("set local role authenticated");
    await conn.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    return await fn(conn);
  } finally {
    await conn.query("rollback");
    conn.release();
  }
}

beforeAll(async () => {
  const c = await pool.connect();
  try {
    for (const [key, id] of Object.entries(ids)) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, `${key}-${id}@test.local`]);
    }
    await c.query("insert into public.organizations (id, slug, name, created_by) values ($1, $2, 'A', $3), ($4, $5, 'B', $6)", [
      orgA, `st-a-${orgA.slice(0, 8)}`, ids.manager, orgB, `st-b-${orgB.slice(0, 8)}`, ids.other,
    ]);
    await c.query(
      `insert into public.organization_members (organization_id, user_id, role) values
        ($1, $2, 'event_manager'), ($1, $3, 'report_viewer'), ($4, $5, 'owner')`,
      [orgA, ids.manager, ids.viewer, orgB, ids.other],
    );
  } finally {
    c.release();
  }
});

afterAll(() => pool.end());

const insert = (c: pg.PoolClient, path: string) =>
  c.query("insert into storage.objects (bucket_id, name) values ('event-covers', $1)", [path]);

describe("storage event-covers", () => {
  it("gerente envia e descarta capa na pasta da própria organização", async () => {
    await asUser(ids.manager, async (c) => {
      const path = `${orgA}/${randomUUID()}.webp`;
      await insert(c, path);
      const del = await c.query("delete from storage.objects where bucket_id = 'event-covers' and name = $1", [path]);
      expect(del.rowCount).toBe(1);
    });
  });

  it("nega envio na pasta de outra organização e a quem só lê relatórios", async () => {
    await asUser(ids.manager, async (c) => {
      await expect(insert(c, `${orgB}/${randomUUID()}.webp`)).rejects.toThrow(/row-level security/);
    });
    await asUser(ids.viewer, async (c) => {
      await expect(insert(c, `${orgA}/${randomUUID()}.webp`)).rejects.toThrow(/row-level security/);
    });
  });

  it("pasta fora do padrão é negada pela RLS, sem erro de conversão", async () => {
    await asUser(ids.manager, async (c) => {
      await expect(insert(c, "nao-e-uuid/x.webp")).rejects.toThrow(/row-level security/);
    });
  });

  it("não apaga capa de outra organização", async () => {
    const path = `${orgB}/${randomUUID()}.webp`;
    const admin = await pool.connect();
    try {
      await admin.query("insert into storage.objects (bucket_id, name) values ('event-covers', $1)", [path]);
      await asUser(ids.manager, async (c) => {
        const del = await c.query("delete from storage.objects where name = $1", [path]);
        expect(del.rowCount).toBe(0);
      });
    } finally {
      await admin.query("delete from storage.objects where name = $1", [path]);
      admin.release();
    }
  });
});

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

// Limite de taxa: o contador bloqueia acima do teto e só o service_role pode chamá-lo.

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL não definida. Rode `npm run db:reset:local` com ela configurada.");
}

const pool = new pg.Pool({ connectionString: url, max: 2 });
afterAll(() => pool.end());

async function as<T>(role: "anon" | "authenticated" | "service_role", fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query("begin");
    await conn.query(`set local role ${role}`);
    return await fn(conn);
  } finally {
    await conn.query("rollback");
    conn.release();
  }
}

describe("rate_limit_hit", () => {
  it("permite até o teto e bloqueia depois", async () => {
    const key = `test:${randomUUID()}`;
    await as("service_role", async (c) => {
      const results: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await c.query("select public.rate_limit_hit($1, 3, 3600) as ok", [key]);
        results.push(r.rows[0].ok);
      }
      expect(results).toEqual([true, true, true, false]);
    });
  });

  it("não é chamável por anon nem por usuário logado", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await as(role, async (c) => {
        await expect(c.query("select public.rate_limit_hit('x', 1, 60)")).rejects.toThrow(/permission denied/);
      });
    }
  });
});

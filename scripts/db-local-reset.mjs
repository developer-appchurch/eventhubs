// Recria o banco LOCAL de testes: stub do Supabase + migrations em ordem.
// Recusa qualquer host que não seja loopback, para nunca tocar um banco remoto.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  console.error("TEST_DATABASE_URL não definida. Ex.: postgres://postgres:postgres@127.0.0.1:54322/postgres");
  process.exit(1);
}

const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Recusado: host "${host}" não é local. Este script apaga schemas e só roda em loopback.`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("begin");
  await client.query("drop schema if exists public cascade; create schema public;");
  await client.query("drop schema if exists private cascade;");
  await client.query("drop schema if exists auth cascade;");
  await client.query("drop schema if exists storage cascade;");
  await client.query("grant all on schema public to postgres; grant all on schema public to public;");
  await client.query(readFileSync(join(root, "supabase/tests/local_auth_stub.sql"), "utf8"));

  const dir = join(root, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await client.query(readFileSync(join(dir, file), "utf8"));
    console.log(`aplicada: ${file}`);
  }
  await client.query("commit");
  console.log("Banco local pronto.");
} catch (error) {
  await client.query("rollback");
  console.error("Falha ao aplicar migrations:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

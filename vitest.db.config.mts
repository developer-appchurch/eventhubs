import { defineConfig } from "vitest/config";

// Testes que exigem PostgreSQL local (TEST_DATABASE_URL). Rodam em série para evitar
// interferência entre sessões de teste no mesmo banco.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/security/**/*.test.ts", "tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});

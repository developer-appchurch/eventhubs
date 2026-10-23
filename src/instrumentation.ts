// Valida as variáveis de ambiente na inicialização do servidor. Registra apenas os nomes
// ausentes (nunca valores). Rotas privadas passam a responder 503 em vez de fingir conexão.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getEnv, ConfigError } = await import("@/lib/env");
  try {
    getEnv();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`[eventhubs] ${error.message}. Veja docs/configuracao.md.`);
      return;
    }
    throw error;
  }
}

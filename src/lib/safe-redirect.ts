// Aceita somente caminhos internos relativos. Bloqueia URLs absolutas, "//" e barras
// invertidas que navegadores interpretam como host externo.
export function safeNextPath(candidate: string | null | undefined, fallback = "/app"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }
  return candidate;
}

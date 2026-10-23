// Identificadores públicos de organização e de evento. O banco valida o formato; aqui o
// valor é normalizado e as rotas reservadas são recusadas antes de chegar ao banco.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 60;

export const RESERVED_SLUGS = new Set([
  "api", "app", "account", "admin", "auth", "login", "logout", "signup", "onboarding",
  "forgot-password", "reset-password", "static", "public", "_next", "www", "mail",
  "suporte", "ajuda", "termos", "privacidade", "entrar", "sair", "configuracoes",
]);

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateSlug(slug: string): string | null {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    return `O identificador deve ter entre ${SLUG_MIN} e ${SLUG_MAX} caracteres.`;
  }
  if (!SLUG_PATTERN.test(slug)) {
    return "Use apenas letras minúsculas, números e hífens.";
  }
  if (RESERVED_SLUGS.has(slug)) {
    return "Este identificador é reservado. Escolha outro.";
  }
  return null;
}

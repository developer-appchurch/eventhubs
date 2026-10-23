// Contrato de retorno das Server Actions. Mensagens são pensadas para o usuário final e
// nunca contêm detalhes internos (SQL, stack, nomes de tabela).
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const INITIAL_STATE: ActionState = { ok: false };

// Exceções nomeadas das funções do banco (raise exception '<CÓDIGO>' using errcode = 'P0001').
const DOMAIN_MESSAGES: Record<string, string> = {
  LAST_OWNER: "A organização precisa de pelo menos um proprietário ativo.",
  INVALID_TRANSITION: "Esta mudança de status não é permitida a partir do status atual.",
  EVENT_IN_PAST: "Não é possível publicar um evento que já terminou. Ajuste as datas.",
  LOCATION_REQUIRED: "Informe o local antes de publicar um evento presencial ou híbrido.",
  NO_ACTIVE_TICKET: "Cadastre pelo menos um tipo de ingresso ativo antes de publicar.",
  EVENT_LOCKED: "Eventos encerrados ou cancelados não podem mais ser alterados.",
  SLUG_LOCKED: "O endereço do evento não pode mudar depois da publicação, para não quebrar links já divulgados.",
  IDENTITY_FIELDS_REQUIRED: "O formulário precisa dos campos Nome e E-mail, ativos e obrigatórios.",
  INVALID_FORM: "O formulário enviado é inválido.",
};

// Códigos SQLSTATE e exceções lançadas pelas funções do banco, traduzidos para o usuário.
export function mapDatabaseError(error: { code?: string; message?: string }): ActionState {
  switch (error.code) {
    case "23505":
      return { ok: false, fieldErrors: { slug: "Este identificador já está em uso." } };
    case "23514":
      return error.message?.includes("slug")
        ? { ok: false, fieldErrors: { slug: "Use letras minúsculas, números e hífens." } }
        : { ok: false, message: "Alguns dados são inválidos. Revise os campos e tente novamente." };
    case "22P02":
      return { ok: false, message: "Alguns dados são inválidos. Revise os campos e tente novamente." };
    case "P0001":
      return { ok: false, message: DOMAIN_MESSAGES[error.message ?? ""] ?? "Não foi possível concluir a operação." };
    case "28000":
      return { ok: false, message: "Sua sessão expirou. Entre novamente para continuar." };
    case "42501":
      return { ok: false, message: "Você não tem permissão para realizar esta ação." };
    default:
      return { ok: false, message: "Não foi possível concluir a operação. Tente novamente." };
  }
}

// Primeira mensagem de erro de cada campo, no formato de fieldErrors.
export function firstErrors(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    errors[String(issue.path[0] ?? "form")] ??= issue.message;
  }
  return errors;
}

export function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

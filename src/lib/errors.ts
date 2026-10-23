// Contrato de retorno das Server Actions. Mensagens são pensadas para o usuário final e
// nunca contêm detalhes internos (SQL, stack, nomes de tabela).
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const INITIAL_STATE: ActionState = { ok: false };

// Códigos SQLSTATE e exceções lançadas pelas funções do banco, traduzidos para o usuário.
export function mapDatabaseError(error: { code?: string; message?: string }): ActionState {
  switch (error.code) {
    case "23505":
      return { ok: false, fieldErrors: { slug: "Este identificador já está em uso." } };
    case "23514":
      return { ok: false, fieldErrors: { slug: "Use letras minúsculas, números e hífens." } };
    case "28000":
      return { ok: false, message: "Sua sessão expirou. Entre novamente para continuar." };
    case "42501":
      return { ok: false, message: "Você não tem permissão para realizar esta ação." };
    default:
      return { ok: false, message: "Não foi possível concluir a operação. Tente novamente." };
  }
}

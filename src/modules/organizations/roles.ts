export const ORGANIZATION_ROLES = [
  "owner",
  "admin",
  "event_manager",
  "checkin_operator",
  "report_viewer",
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  event_manager: "Gestor de eventos",
  checkin_operator: "Operador de check-in",
  report_viewer: "Visualizador de relatórios",
};

// Quem pode alterar dados da organização. Espelha as políticas RLS de UPDATE.
export function canManageOrganization(role: OrganizationRole): boolean {
  return role === "owner" || role === "admin";
}

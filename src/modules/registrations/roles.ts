import type { OrganizationRole } from "@/modules/organizations/roles";

// Espelha private.registration_reader_roles(): quem vê dados pessoais dos inscritos.
export function canReadRegistrations(role: OrganizationRole): boolean {
  return role === "owner" || role === "admin" || role === "event_manager" || role === "checkin_operator";
}

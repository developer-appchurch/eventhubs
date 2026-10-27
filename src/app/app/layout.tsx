// Área privada: sempre renderizada por requisição (sessão e dados do usuário).
export const dynamic = "force-dynamic";

import { AppShell } from "@/components/navigation/app-shell";
import { getOwnProfile } from "@/modules/auth/profile";
import { requireUser } from "@/modules/auth/session";
import { listMyOrganizations } from "@/modules/organizations/queries";

export default async function PrivateAppLayout({ children }: { children: React.ReactNode }) {
  // Em paralelo: as consultas passam pela RLS, então sem sessão voltam vazias e o redirect vence.
  const [user, organizations, profile] = await Promise.all([requireUser("/app"), listMyOrganizations(), getOwnProfile()]);

  return (
    <AppShell organizations={organizations} userName={profile?.full_name || user.email || "Minha conta"}>
      {children}
    </AppShell>
  );
}

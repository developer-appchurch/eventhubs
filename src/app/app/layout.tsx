// Área privada: sempre renderizada por requisição (sessão e dados do usuário).
export const dynamic = "force-dynamic";

import { AppShell } from "@/components/navigation/app-shell";
import { getOwnProfile } from "@/modules/auth/profile";
import { requireUser } from "@/modules/auth/session";
import { listMyOrganizations } from "@/modules/organizations/queries";

export default async function PrivateAppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/app");
  const [organizations, profile] = await Promise.all([listMyOrganizations(), getOwnProfile()]);

  return (
    <AppShell organizations={organizations} userName={profile?.full_name || user.email || "Minha conta"}>
      {children}
    </AppShell>
  );
}

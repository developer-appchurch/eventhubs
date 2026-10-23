import type { Metadata } from "next";
import { Card, CardTitle } from "@/components/ui/card";
import { getOwnProfile } from "@/modules/auth/profile";
import { requireUser } from "@/modules/auth/session";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const user = await requireUser("/app/account");
  const profile = await getOwnProfile();

  return (
    <div className="grid max-w-2xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">Minha conta</h1>
        <p className="text-ink-muted">Seus dados básicos de acesso e contato.</p>
      </header>
      <Card>
        <CardTitle>Dados pessoais</CardTitle>
        <div className="mt-5">
          <ProfileForm initialName={profile?.full_name ?? ""} email={user.email ?? ""} />
        </div>
      </Card>
    </div>
  );
}

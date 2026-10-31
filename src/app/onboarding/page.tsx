import type { Metadata } from "next";
import Link from "@/components/navigation/intent-link";
import { AuthPage } from "@/components/navigation/auth-page";
import { requireUser } from "@/modules/auth/session";
import { listMyOrganizations } from "@/modules/organizations/queries";
import { CreateOrganizationForm } from "./create-organization-form";

export const metadata: Metadata = { title: "Criar organização" };

export default async function OnboardingPage() {
  await requireUser("/onboarding");
  const existing = await listMyOrganizations();

  return (
    <AuthPage
      title="Crie sua organização"
      description="A organização reúne seus eventos, formulários, inscrições e equipe. Você será o proprietário."
    >
      <CreateOrganizationForm />
      {existing.length > 0 ? (
        <p className="text-sm text-ink-muted">
          Já participa de {existing.length} {existing.length === 1 ? "organização" : "organizações"}.{" "}
          <Link href="/app" className="font-semibold text-brand-700 hover:underline">
            Ir para o painel
          </Link>
        </p>
      ) : null}
    </AuthPage>
  );
}

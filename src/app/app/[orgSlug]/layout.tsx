import { notFound } from "next/navigation";
import { getOrganizationContext, redirectIfOrganizationRenamed } from "@/modules/organizations/queries";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  // Slug inexistente ou sem vínculo ativo responde igual: não revela se a organização existe.
  const org = await getOrganizationContext(orgSlug);
  if (!org) {
    await redirectIfOrganizationRenamed(orgSlug);
    notFound();
  }

  return (
    <div className="grid gap-6">
      <header className="grid border-b border-line pb-3">
        <p className="text-xs text-ink-muted">Organização</p>
        <h1 className="text-xl font-bold tracking-tight">{org.name}</h1>
      </header>
      {children}
    </div>
  );
}

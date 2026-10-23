import { notFound } from "next/navigation";
import { OrgNav } from "@/components/navigation/org-nav";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { ROLE_LABELS } from "@/modules/organizations/roles";
import { Badge } from "@/components/ui/badge";

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
  if (!org) notFound();

  return (
    <div className="grid gap-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold sm:text-3xl">{org.name}</h1>
          <Badge tone="brand">{ROLE_LABELS[org.role]}</Badge>
        </div>
        <OrgNav orgSlug={org.slug} />
      </header>
      {children}
    </div>
  );
}

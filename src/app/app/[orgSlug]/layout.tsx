import { notFound } from "next/navigation";
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
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-5">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-xl bg-brand-gradient text-lg font-bold text-white shadow-(--shadow-card)">
          {org.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="grid gap-0.5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{org.name}</h1>
          <p className="text-sm text-ink-muted">/{org.slug}</p>
        </div>
        <Badge tone="brand">{ROLE_LABELS[org.role]}</Badge>
      </header>
      {children}
    </div>
  );
}

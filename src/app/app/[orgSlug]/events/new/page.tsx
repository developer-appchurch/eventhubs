import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/modules/auth/session";
import { canManageEvents } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "Novo evento" };

export default async function NewEventPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org || !canManageEvents(org.role)) notFound();
  const user = await getCurrentUser();

  return (
    <Card>
      <CardTitle>Novo evento</CardTitle>
      <p className="mt-1 text-sm text-ink-muted">
        O evento nasce como rascunho, com os campos Nome e E-mail no formulário. Depois você cadastra ingressos e publica.
      </p>
      <div className="mt-6">
        <EventForm organizationSlug={org.slug} organizationName={org.name} defaultContactEmail={user?.email ?? ""} />
      </div>
    </Card>
  );
}

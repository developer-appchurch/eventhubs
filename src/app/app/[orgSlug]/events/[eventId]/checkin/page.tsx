import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/modules/events/queries";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { canReadRegistrations } from "@/modules/registrations/roles";
import { CheckinPanel, type CheckinSearchParams } from "./checkin-panel";

export const metadata: Metadata = { title: "Check-in", referrer: "no-referrer" };

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
  searchParams: Promise<CheckinSearchParams>;
}) {
  const { orgSlug, eventId } = await params;
  const org = await getOrganizationContext(orgSlug);
  const event = org ? await getEvent(org.id, eventId) : null;
  if (!org || !event || !canReadRegistrations(org.role)) notFound();
  return <CheckinPanel org={org} event={event} sp={await searchParams} />;
}

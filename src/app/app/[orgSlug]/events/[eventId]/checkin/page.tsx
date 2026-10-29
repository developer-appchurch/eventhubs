import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrganizationEvent } from "@/modules/events/queries";
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
  const { org, event } = await getOrganizationEvent(orgSlug, eventId);
  if (!org || !event || !canReadRegistrations(org.role)) notFound();
  return <CheckinPanel org={org} event={event} sp={await searchParams} />;
}

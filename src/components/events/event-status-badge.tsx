import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type EventStatus } from "@/modules/events/status";

const TONES = {
  draft: "neutral",
  published: "success",
  registration_closed: "warning",
  ended: "neutral",
  cancelled: "danger",
} as const;

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

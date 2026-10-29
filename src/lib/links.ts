// Links externos montados a partir dos dados do evento, sem dependência extra.

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// Google Agenda aceita datas UTC no formato YYYYMMDDTHHmmssZ.
const utcStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function calendarUrl(
  event: { title: string; starts_at: string; ends_at: string; venue_name: string; address: string; format: string },
  organizerName: string,
): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.starts_at)}/${utcStamp(event.ends_at)}`,
    details: `Organização: ${organizerName}`,
  });
  const place = [event.venue_name, event.address].filter(Boolean).join(", ");
  if (event.format !== "online" && place) params.set("location", place);
  return `https://calendar.google.com/calendar/render?${params}`;
}

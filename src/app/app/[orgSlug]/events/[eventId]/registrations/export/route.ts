import { CSV_BOM, csvRow } from "@/lib/csv";
import { formatShortDateTime } from "@/lib/datetime";
import { getEvent, listTicketTypes } from "@/modules/events/queries";
import { canManageEvents } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import {
  listFormVersions,
  listRegistrations,
  PRESENCE_FILTERS,
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUSES,
  type PresenceFilter,
  type RegistrationStatus,
} from "@/modules/registrations/queries";

const BATCH = 1000;
// shortcut: exportação limitada a 50 mil linhas por arquivo; acima disso, gerar em segundo plano.
const MAX_ROWS = 50_000;

// Exporta as inscrições do evento com os mesmos filtros da tela. Só quem administra o evento:
// o operador de check-in vê a lista, mas não leva os dados pessoais para fora.
export async function GET(request: Request, { params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const org = await getOrganizationContext(orgSlug);
  const event = org && canManageEvents(org.role) ? await getEvent(org.id, eventId) : null;
  if (!org || !event) return new Response("Não encontrado.", { status: 404 });

  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").slice(0, 100);
  const statusParam = sp.get("status") as RegistrationStatus;
  const status = REGISTRATION_STATUSES.includes(statusParam) ? statusParam : undefined;
  const presenceParam = sp.get("presence") as PresenceFilter;
  const presence = PRESENCE_FILTERS.includes(presenceParam) ? presenceParam : undefined;
  const [tickets, forms] = await Promise.all([listTicketTypes(event.id), listFormVersions(event.id)]);
  const ticketNames = new Map(tickets.map((t) => [t.id, t.name]));
  const ticket = ticketNames.has(sp.get("ticket") ?? "") ? (sp.get("ticket") as string) : undefined;

  // Uma coluna por pergunta de qualquer versão do formulário (nome e e-mail têm colunas fixas).
  const questions = new Map<string, string>();
  for (const fields of forms.values()) {
    for (const f of fields) if (f.type !== "name" && f.type !== "email") questions.set(f.key, f.label);
  }

  let csv = CSV_BOM + csvRow(["Nome", "E-mail", "Ingresso", "Situação", "Inscrição em", "Check-in em", ...questions.values()]);
  for (let page = 1; (page - 1) * BATCH < MAX_ROWS; page++) {
    const { registrations, total } = await listRegistrations(event.id, { q, status, ticket, presence, page, pageSize: BATCH });
    for (const r of registrations) {
      csv += csvRow([
        r.attendee_name,
        r.attendee_email,
        ticketNames.get(r.ticket_type_id),
        REGISTRATION_STATUS_LABELS[r.status],
        formatShortDateTime(r.created_at, event.timezone),
        r.checkins ? formatShortDateTime(r.checkins.checked_in_at, event.timezone) : "",
        ...[...questions.keys()].map((key) => formatAnswer(r.answers[key])),
      ]);
    }
    if (page * BATCH >= total) break;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inscricoes-${event.slug}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function formatAnswer(value: unknown): unknown {
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return value;
}

import { CSV_BOM, csvRow } from "@/lib/csv";
import { formatShortDateTime } from "@/lib/datetime";
import { canManageEvents } from "@/modules/events/status";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { parseOrgRegistrationFilters, REGISTRATION_STATUS_LABELS } from "@/modules/registrations/filters";
import { listEventOptions, listOrgRegistrations, type OrgRegistrationItem } from "@/modules/registrations/queries";

const BATCH = 1000;
// shortcut: exportação limitada a 50 mil linhas por arquivo; acima disso, gerar em segundo plano.
const MAX_ROWS = 50_000;
const HEADERS = ["Nome", "E-mail", "Evento", "Ingresso", "Situação", "Inscrição em", "Check-in em"];

// Exporta a lista geral com os mesmos filtros da tela, em CSV ou em página pronta para
// "Salvar como PDF". Só quem administra eventos, como na exportação do evento.
export async function GET(request: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrganizationContext(orgSlug);
  if (!org || !canManageEvents(org.role)) return new Response("Não encontrado.", { status: 404 });

  const sp = new URL(request.url).searchParams;
  const filters = parseOrgRegistrationFilters((key) => sp.get(key));
  const rows: string[][] = [];
  for (let page = 1; (page - 1) * BATCH < MAX_ROWS; page++) {
    const { registrations, total } = await listOrgRegistrations(org.id, filters, page, BATCH);
    rows.push(...registrations.map(toRow));
    if (page * BATCH >= total) break;
  }

  const name = `inscricoes-${org.slug}`;
  const headers = { "Cache-Control": "private, no-store" };
  if (sp.get("format") !== "pdf") {
    return new Response(CSV_BOM + csvRow(HEADERS) + rows.map(csvRow).join(""), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }

  const eventTitle = filters.event ? (await listEventOptions(org.id)).find((e) => e.id === filters.event)?.title : undefined;
  const summary = [
    eventTitle ? `Evento: ${eventTitle}` : "Todos os eventos",
    filters.status ? `Situação: ${REGISTRATION_STATUS_LABELS[filters.status]}` : null,
    filters.from ? `De ${formatDay(filters.from)}` : null,
    filters.to ? `Até ${formatDay(filters.to)}` : null,
    filters.q ? `Busca: "${filters.q}"` : null,
    `${rows.length.toLocaleString("pt-BR")} inscrições`,
  ].filter(Boolean);
  return new Response(printPage(`Inscrições · ${org.name}`, summary.join(" · "), rows), {
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

function toRow(r: OrgRegistrationItem): string[] {
  const tz = r.event.timezone;
  return [
    r.attendee_name,
    r.attendee_email,
    r.event.title,
    r.ticket.name,
    REGISTRATION_STATUS_LABELS[r.status],
    formatShortDateTime(r.created_at, tz),
    r.checkins ? formatShortDateTime(r.checkins.checked_in_at, tz) : "",
  ];
}

function formatDay(date: string): string {
  return date.split("-").reverse().join("/");
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

// Página de impressão em A4 paisagem; abre o diálogo de impressão, onde se escolhe "Salvar como PDF".
function printPage(title: string, summary: string, rows: string[][]): string {
  const generated = formatShortDateTime(new Date().toISOString(), "America/Sao_Paulo");
  const cells = (tag: string, values: string[]) => values.map((v) => `<${tag}>${escapeHtml(v)}</${tag}>`).join("");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
body { font: 11px/1.4 system-ui, sans-serif; color: #111; margin: 16px; }
h1 { font-size: 18px; margin: 0 0 4px; }
p { margin: 0 0 12px; color: #555; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
th { background: #f3f0fa; font-weight: 600; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
td:nth-child(2) { word-break: break-all; }
.actions { margin-bottom: 12px; }
@media print { .actions { display: none; } body { margin: 0; } }
</style></head><body>
<div class="actions"><button type="button" onclick="window.print()">Imprimir / Salvar PDF</button></div>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(summary)} · Gerado em ${escapeHtml(generated)}</p>
<table><thead><tr>${cells("th", HEADERS)}</tr></thead>
<tbody>${rows.map((r) => `<tr>${cells("td", r)}</tr>`).join("")}</tbody></table>
<script>window.addEventListener("load", () => window.print());</script>
</body></html>`;
}

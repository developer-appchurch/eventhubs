"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { firstErrors, formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { slugify } from "@/lib/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { isUuid } from "./queries";
import { eventInputSchema } from "./schemas";
import { canManageEvents, EVENT_STATUSES, type EventStatus } from "./status";

const FORBIDDEN: ActionState = { ok: false, message: "Você não tem permissão para gerenciar eventos desta organização." };

// Resolve a organização pela sessão e confere o papel. A RLS repete a verificação no banco;
// esta serve para dar uma mensagem clara e para que organization_id nunca venha do cliente.
async function managedOrganization(formData: FormData) {
  const org = await getOrganizationContext(text(formData, "organizationSlug"));
  return org && canManageEvents(org.role) ? org : null;
}

function eventFields(formData: FormData) {
  const title = text(formData, "title");
  return {
    title,
    slug: text(formData, "slug").trim() || slugify(title).slice(0, 60),
    description: text(formData, "description"),
    format: text(formData, "format"),
    venueName: text(formData, "venueName"),
    address: text(formData, "address"),
    onlineUrl: text(formData, "onlineUrl"),
    timezone: text(formData, "timezone"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt"),
    capacity: text(formData, "capacity"),
    contactEmail: text(formData, "contactEmail"),
    contactPhone: text(formData, "contactPhone"),
    participantTerms: text(formData, "participantTerms"),
    isPaid: text(formData, "isPaid") === "true",
    salesStartAt: text(formData, "salesStartAt"),
  };
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const COVER_TYPES = ["image/webp", "image/jpeg", "image/png"];

// Capa enviada como arquivo. O navegador já reduz a foto; aqui ela é sempre regravada em
// WebP, o que também garante que o arquivo é mesmo uma imagem.
async function uploadCover(supabase: Supabase, organizationId: string, formData: FormData): Promise<{ url?: string; path?: string; error?: string }> {
  const file = formData.get("coverImage");
  if (!(file instanceof File) || file.size === 0) return {};
  if (!COVER_TYPES.includes(file.type) || file.size > 1_000_000) return { error: "Envie uma foto JPG, PNG ou WebP de até 1 MB." };

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return { error: "Não foi possível ler esta imagem." };
  }

  const path = `${organizationId}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from("event-covers").upload(path, webp, { contentType: "image/webp" });
  if (error) return { error: "Não foi possível enviar a imagem de capa." };
  return { url: supabase.storage.from("event-covers").getPublicUrl(path).data.publicUrl, path };
}

// Capa recém-enviada cuja gravação do evento falhou: ninguém a referencia ainda, então sai.
// Capas substituídas não são apagadas: eventos duplicados reaproveitam a mesma URL.
async function discardCover(supabase: Supabase, path: string | undefined) {
  if (path) await supabase.storage.from("event-covers").remove([path]);
}

export async function createEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrganization(formData);
  if (!org) return FORBIDDEN;

  const parsed = eventInputSchema.safeParse(eventFields(formData));
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };
  if (new Date(parsed.data.ends_at) <= new Date()) return { ok: false, fieldErrors: { endsAt: "O término deve ser hoje ou uma data futura." } };

  const supabase = await createSupabaseServerClient();
  const cover = await uploadCover(supabase, org.id, formData);
  if (cover.error) return { ok: false, fieldErrors: { coverImage: cover.error } };

  const { data, error } = await supabase
    .from("events")
    .insert({
      ...parsed.data,
      cover_image_url: cover.url ?? null,
      organization_id: org.id,
    })
    .select("id")
    .single();

  if (error) {
    await discardCover(supabase, cover.path);
    return mapDatabaseError(error);
  }
  redirect(`/app/${org.slug}/events/${data.id}`);
}

export async function updateEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrganization(formData);
  const eventId = text(formData, "eventId");
  if (!org || !isUuid(eventId)) return FORBIDDEN;

  const parsed = eventInputSchema.safeParse(eventFields(formData));
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const cover = await uploadCover(supabase, org.id, formData);
  if (cover.error) return { ok: false, fieldErrors: { coverImage: cover.error } };

  const { data, error } = await supabase
    .from("events")
    .update(cover.url ? { ...parsed.data, cover_image_url: cover.url } : parsed.data)
    .eq("id", eventId)
    .eq("organization_id", org.id)
    .select("id");

  if (error || !data?.length) await discardCover(supabase, cover.path);
  if (error) return mapDatabaseError(error);
  if (!data?.length) return FORBIDDEN;

  revalidatePath(`/app/${org.slug}/events/${eventId}`, "layout");
  return { ok: true, message: "Evento salvo." };
}

export async function changeEventStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrganization(formData);
  const eventId = text(formData, "eventId");
  const status = text(formData, "status") as EventStatus;
  if (!org || !isUuid(eventId) || !EVENT_STATUSES.includes(status)) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("change_event_status", { p_event_id: eventId, p_status: status });
  if (error) return mapDatabaseError(error);

  revalidatePath(`/app/${org.slug}/events`, "layout");
  return { ok: true, message: "Status do evento atualizado." };
}

// Só eventos sem nenhuma inscrição podem ser excluídos; os demais são cancelados.
export async function deleteEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrganization(formData);
  const eventId = text(formData, "eventId");
  if (!org || !isUuid(eventId)) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_event", { p_event_id: eventId });
  if (error) return mapDatabaseError(error);

  revalidatePath(`/app/${org.slug}/events`);
  redirect(`/app/${org.slug}/events`);
}

// Cópia em rascunho com ingressos e formulário, sem inscrições; abre a cópia para ajustar datas.
export async function duplicateEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await managedOrganization(formData);
  const eventId = text(formData, "eventId");
  if (!org || !isUuid(eventId)) return FORBIDDEN;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("duplicate_event", { p_event_id: eventId });
  if (error) return mapDatabaseError(error);

  revalidatePath(`/app/${org.slug}/events`);
  redirect(`/app/${org.slug}/events/${data}`);
}

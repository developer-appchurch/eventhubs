"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicEvent, isUuid } from "@/modules/events/queries";
import { publicAvailability } from "@/modules/events/status";
import { answersFromFormData, validateAnswers } from "@/modules/forms/answers";
import type { FormField } from "@/modules/forms/fields";
import { sendConfirmationEmail } from "@/modules/notifications/confirmation";
import { checkoutUrlFor } from "@/modules/payments/service";
import { ticketAvailability } from "./tickets";

// Inscrição pública. Tudo que vem do navegador é revalidado aqui (respostas pela versão
// vigente do formulário) e de novo no banco (prazo, ingresso, preço, vagas), que é quem decide.
export async function registerForEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Campo isca invisível: robôs costumam preenchê-lo. Resposta neutra, sem gravar nada.
  if (text(formData, "website")) return { ok: false, message: "Não foi possível concluir a inscrição. Tente novamente." };

  const orgSlug = text(formData, "orgSlug");
  const eventSlug = text(formData, "eventSlug");
  const data = await getPublicEvent(orgSlug, eventSlug);
  if (!data?.form || publicAvailability(data.event) !== "open") {
    return { ok: false, message: "As inscrições para este evento não estão abertas." };
  }

  const ticketId = text(formData, "ticketTypeId");
  const ticket = data.tickets.find((t) => t.id === ticketId);
  if (!ticket || ticketAvailability(ticket, undefined, data.payments_enabled) !== "available") {
    return { ok: false, message: "Escolha um ingresso disponível.", fieldErrors: { ticketTypeId: "Escolha um ingresso disponível." } };
  }

  const fields = data.form.fields.map((f) => ({ ...f, is_active: true })) as FormField[];
  const result = validateAnswers(fields, answersFromFormData(fields, formData));
  if (!result.ok) return { ok: false, message: "Há campos para corrigir.", fieldErrors: result.errors };

  if (data.event.participant_terms && formData.get("acceptTerms") !== "on") {
    return { ok: false, message: "É preciso aceitar os termos do evento.", fieldErrors: { acceptTerms: "É preciso aceitar os termos para continuar." } };
  }

  const idempotencyKey = text(formData, "idempotencyKey");
  if (!isUuid(idempotencyKey)) return { ok: false, message: "Recarregue a página e tente novamente." };

  const supabase = await createSupabaseServerClient();
  const { data: created, error } = await supabase.rpc("register_for_event", {
    p_event_id: data.event.id,
    p_ticket_type_id: ticket.id,
    p_form_version: data.form.version,
    p_answers: result.values,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return mapDatabaseError(error);

  const { public_token: token, status } = created as { public_token: string; status: string };
  const statusPage = `/${data.organization.slug}/${data.event.slug}/inscricao/${token}`;
  // O e-mail sai depois da resposta: a pessoa não espera o provedor para ver a inscrição.
  if (status === "confirmed") after(() => sendConfirmationEmail({ token }));
  redirect((status === "pending_payment" && (await safeCheckoutUrl(token))) || statusPage);
}

// Pagamento da reserva. Falha no Mercado Pago não perde a inscrição: a página dela oferece
// tentar de novo enquanto a reserva vale.
export async function payRegistration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = text(formData, "token");
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, message: "Inscrição não encontrada." };
  const url = await safeCheckoutUrl(token);
  if (!url) return { ok: false, message: "Não foi possível abrir o pagamento agora. Tente novamente em instantes." };
  redirect(url);
}

async function safeCheckoutUrl(token: string): Promise<string | null> {
  try {
    return await checkoutUrlFor(token);
  } catch (error) {
    console.error("[pagamentos] falha ao criar checkout", { error: error instanceof Error ? error.message : "erro" });
    return null;
  }
}

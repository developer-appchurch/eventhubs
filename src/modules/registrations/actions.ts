"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { formText as text, mapDatabaseError, type ActionState } from "@/lib/errors";
import { allowRequest, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicEvent, isUuid } from "@/modules/events/queries";
import { canManageEvents, publicAvailability } from "@/modules/events/status";
import { answersFromFormData, validateAnswers } from "@/modules/forms/answers";
import type { FormField } from "@/modules/forms/fields";
import { sendConfirmationEmail, sendPendingPaymentEmail } from "@/modules/notifications/confirmation";
import { getOrganizationContext } from "@/modules/organizations/queries";
import { checkoutUrlFor, pixCheckoutUrlFor } from "@/modules/payments/service";
import { registrationCookie } from "./queries";
import { ticketAvailability } from "./tickets";

// Inscrição pública. Tudo que vem do navegador é revalidado aqui (respostas pela versão
// vigente do formulário) e de novo no banco (prazo, ingresso, preço, vagas), que é quem decide.
export async function registerForEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Campo isca invisível: robôs costumam preenchê-lo. Resposta neutra, sem gravar nada.
  if (text(formData, "website")) return { ok: false, message: "Não foi possível concluir a inscrição. Tente novamente." };

  if (!(await allowRequest("register", 20))) return { ok: false, message: RATE_LIMITED_MESSAGE };

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
  const quantity = Number(text(formData, "quantity") || 1);
  if (!Number.isInteger(quantity) || quantity < Math.max(1, ticket.min_per_order) || quantity > ticket.max_per_order) {
    return { ok: false, message: "Quantidade de ingressos fora do limite por inscrição.", fieldErrors: { quantity: "Quantidade de ingressos fora do limite por inscrição." } };
  }

  // Um conjunto de respostas por participante; os erros voltam como "<posição>.<campo>".
  const answers: Record<string, unknown>[] = [];
  const errors: Record<string, string> = {};
  const emailKey = fields.find((f) => f.type === "email")?.key;
  const seenEmails = new Set<string>();
  for (let i = 0; i < quantity; i++) {
    const raw = answersFromFormData(fields, formData, `p${i}.`);
    const result = validateAnswers(fields, raw);
    if (!result.ok) {
      for (const [key, message] of Object.entries(result.errors)) errors[`${i}.${key}`] = message;
      continue;
    }
    answers.push(result.values);
    const email = emailKey && typeof result.values[emailKey] === "string" ? result.values[emailKey].toLowerCase() : null;
    if (email && seenEmails.has(email)) errors[`${i}.${emailKey}`] = "Cada participante precisa de um e-mail diferente.";
    else if (email) seenEmails.add(email);
  }
  if (Object.keys(errors).length) return { ok: false, message: "Há campos para corrigir.", fieldErrors: errors };

  if (data.event.participant_terms && formData.get("acceptTerms") !== "on") {
    return { ok: false, message: "É preciso aceitar os termos do evento.", fieldErrors: { acceptTerms: "É preciso aceitar os termos para continuar." } };
  }

  const idempotencyKey = text(formData, "idempotencyKey");
  if (!isUuid(idempotencyKey)) return { ok: false, message: "Recarregue a página e tente novamente." };

  const supabase = await createSupabaseServerClient();
  const { data: created, error } = await supabase.rpc("register_group_for_event", {
    p_event_id: data.event.id,
    p_ticket_type_id: ticket.id,
    p_form_version: data.form.version,
    p_answers: answers,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return mapDatabaseError(error);

  const { public_token: token, status, tokens } = created as { public_token: string; status: string; tokens: string[] };
  const statusPage = `/${data.organization.slug}/${data.event.slug}/inscricao/${token}`;
  (await cookies()).set(registrationCookie(data.event.id), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/${data.organization.slug}/${data.event.slug}`,
    maxAge: 60 * 86_400,
  });
  // O e-mail sai depois da resposta: a pessoa não espera o provedor para ver a inscrição.
  // Na confirmação direta cada participante recebe o seu; o pagamento pendente avisa só quem lidera.
  if (status === "confirmed") after(() => Promise.all(tokens.map((t) => sendConfirmationEmail({ token: t }))));
  if (status === "pending_payment") after(() => sendPendingPaymentEmail(token));
  // Vai para a página da inscrição, que oferece Pix no app e cartão no Mercado Pago. Mandar direto
  // ao Checkout Pro escondia o Pix quando a conta do vendedor não tem chave Pix cadastrada.
  redirect(statusPage);
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

// Pix pelo Checkout Pro do Mercado Pago, que cobra a taxa da plataforma.
export async function payWithPix(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = text(formData, "token");
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, message: "Inscrição não encontrada." };
  const url = await safeCheckoutUrl(token, pixCheckoutUrlFor);
  if (!url) return { ok: false, message: "Não foi possível abrir o Pix agora. Tente novamente ou pague com cartão." };
  redirect(url);
}

async function safeCheckoutUrl(token: string, urlFor = checkoutUrlFor): Promise<string | null> {
  try {
    return await urlFor(token);
  } catch (error) {
    console.error("[pagamentos] falha ao criar checkout", { error: error instanceof Error ? error.message : "erro" });
    return null;
  }
}

// Cancelar ou apagar pelo organizador. O banco repete papel, status e pagamento; daqui só sai
// a mensagem. Cancelar libera vaga e e-mail sem perder o histórico de pagamento.
export async function manageRegistration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const org = await getOrganizationContext(text(formData, "organizationSlug"));
  const registrationId = text(formData, "registrationId");
  const op = text(formData, "op");
  if (!org || !canManageEvents(org.role) || !isUuid(registrationId) || (op !== "cancel" && op !== "delete")) {
    return { ok: false, message: "Você não tem permissão para gerenciar inscrições desta organização." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(op === "cancel" ? "cancel_registration" : "delete_registration", { p_registration_id: registrationId });
  if (error) return mapDatabaseError(error);

  revalidatePath(`/app/${org.slug}`, "layout");
  return op === "cancel"
    ? { ok: true, message: "Inscrição cancelada. A vaga foi liberada e o e-mail pode se inscrever de novo." }
    : { ok: true, message: "Inscrição apagada. A vaga foi liberada e o e-mail pode se inscrever de novo." };
}

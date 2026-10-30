import { after } from "next/server";
import { getPaymentEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPayment, refundPayment, verifyWebhookSignature } from "@/modules/payments/mercadopago";
import { sellerAccess } from "@/modules/payments/service";
import { sendConfirmationEmail } from "@/modules/notifications/confirmation";

// Webhook do Mercado Pago. A notificação só diz "o pagamento X mudou": o estado vem de uma
// consulta ao Mercado Pago com o token do vendedor, então notificações repetidas, atrasadas ou
// fora de ordem convergem para o mesmo resultado. 2xx encerra; 5xx faz o Mercado Pago tentar de novo.
export async function POST(request: Request) {
  const env = getPaymentEnv();
  if (!env) return new Response(null, { status: 503 });

  const url = new URL(request.url);
  const raw = await request.text();
  if (raw.length > 10_000) return new Response(null, { status: 413 });
  let body: { type?: string; user_id?: string | number; data?: { id?: string | number } };
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return new Response(null, { status: 400 });
  }

  const dataId = url.searchParams.get("data.id") ?? (body.data?.id != null ? String(body.data.id) : null);
  const requestId = request.headers.get("x-request-id");
  const valid = verifyWebhookSignature({ xSignature: request.headers.get("x-signature"), xRequestId: requestId, dataId, secret: env.MERCADOPAGO_WEBHOOK_SECRET });
  if (!valid) return new Response(null, { status: 401 });

  const topic = body.type ?? url.searchParams.get("type") ?? "";
  if (topic !== "payment" || !dataId || !requestId) return new Response(null, { status: 200 });

  const admin = createSupabaseAdminClient(env.SUPABASE_SECRET_KEY);
  const started = await admin.rpc("begin_payment_event", { p_notification_id: requestId, p_topic: topic, p_external_id: dataId });
  if (started.error) return new Response(null, { status: 500 });
  if (started.data === false) return new Response(null, { status: 200 });

  const finish = (result: string, organizationId: string | null = null) =>
    admin.rpc("finish_payment_event", { p_notification_id: requestId, p_result: result, p_org: organizationId });

  try {
    const seller = await sellerAccess(env, admin, { sellerId: String(body.user_id ?? "") });
    if (!seller) {
      await finish("unknown_seller");
      return new Response(null, { status: 200 });
    }
    const payment = await getPayment(seller.token, dataId);
    const { data, error } = await admin.rpc("record_payment", {
      p_registration_id: payment.externalReference,
      p_seller_id: payment.collectorId,
      p_external_id: payment.id,
      p_status: payment.status,
      p_status_detail: payment.statusDetail,
      p_amount_cents: payment.amountCents,
      p_currency: payment.currency,
    });
    if (error) {
      // Referência desconhecida ou de outro vendedor: registrado e encerrado, repetir não muda nada.
      if (error.code === "P0001" || error.code === "22P02") {
        await finish(error.code === "P0001" ? error.message.slice(0, 60) : "UNKNOWN_REFERENCE");
        return new Response(null, { status: 200 });
      }
      throw error;
    }
    // Só alimenta o gráfico Pix x cartão da visão geral: falhar aqui não deve travar a notificação.
    const method = await admin.from("payments").update({ method: payment.method }).eq("provider", "mercadopago").eq("external_id", payment.id);
    if (method.error) console.error("[pagamentos] falha ao gravar a forma de pagamento", { dataId, error: method.error.message });
    // A conta pode ser compartilhada entre organizações: a dona do pagamento é a da inscrição.
    const { result, organization_id, registration_ids } = data as { result: string; organization_id: string; registration_ids?: string[] };
    // Pagou depois de a vaga ir para outra pessoa: devolve sozinho. Se falhar, o aviso na tela
    // de pagamentos continua pedindo o reembolso manual.
    if (result === "paid_without_seat") {
      await refundPayment(seller.token, payment.id).catch((error) =>
        console.error("[pagamentos] falha no reembolso automático", { dataId, error: error instanceof Error ? error.message : "erro" }),
      );
    }
    await finish(result, organization_id);
    if (result === "confirmed" || result === "confirmed_late") {
      const ids = registration_ids?.length ? registration_ids : [payment.externalReference];
      after(() => Promise.all(ids.map((registrationId) => sendConfirmationEmail({ registrationId }))));
    }
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[pagamentos] falha ao processar notificação", { requestId, dataId, error: error instanceof Error ? error.message : "erro" });
    return new Response(null, { status: 500 });
  }
}

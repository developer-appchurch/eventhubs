import { timingSafeEqual } from "node:crypto";
import { sendEventReminders } from "@/modules/notifications/reminder";

// Cron diário da Vercel (vercel.json). A Vercel envia "Authorization: Bearer $CRON_SECRET";
// sem CRON_SECRET configurado a rota fica fechada (503), nunca aberta.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return new Response(null, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response(null, { status: 401 });

  try {
    const result = await sendEventReminders();
    return Response.json(result ?? { skipped: "e-mail não configurado" });
  } catch {
    return new Response(null, { status: 500 });
  }
}

import { createHmac, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { decryptToken, encryptToken } = await import("../../src/modules/payments/crypto");
const mp = await import("../../src/modules/payments/mercadopago");
const { ticketAvailability } = await import("../../src/modules/registrations/tickets");

const KEY = randomBytes(32).toString("base64");

describe("cifra dos tokens", () => {
  it("cifra e decifra; texto ou chave adulterados falham", () => {
    const sealed = encryptToken("APP_USR-segredo", KEY);
    expect(sealed).not.toContain("segredo");
    expect(decryptToken(sealed, KEY)).toBe("APP_USR-segredo");
    expect(encryptToken("APP_USR-segredo", KEY)).not.toBe(sealed);

    const [v, iv, tag, data] = sealed.split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptToken([v, iv, tag, flipped.toString("base64url")].join("."), KEY)).toThrow();
    expect(() => decryptToken(sealed, randomBytes(32).toString("base64"))).toThrow();
    expect(() => decryptToken("lixo", KEY)).toThrow();
  });
});

describe("assinatura do webhook", () => {
  const secret = "segredo-do-painel";
  const sign = (manifest: string) => createHmac("sha256", secret).update(manifest).digest("hex");

  it("aceita assinatura válida e recusa adulterada, ausente ou de outro pagamento", () => {
    const v1 = sign("id:123456;request-id:req-1;ts:1742505638683;");
    const input = { xSignature: `ts=1742505638683,v1=${v1}`, xRequestId: "req-1", dataId: "123456", secret };
    expect(mp.verifyWebhookSignature(input)).toBe(true);
    expect(mp.verifyWebhookSignature({ ...input, dataId: "999" })).toBe(false);
    expect(mp.verifyWebhookSignature({ ...input, xRequestId: "req-2" })).toBe(false);
    expect(mp.verifyWebhookSignature({ ...input, secret: "outro" })).toBe(false);
    expect(mp.verifyWebhookSignature({ ...input, xSignature: null })).toBe(false);
    expect(mp.verifyWebhookSignature({ ...input, xSignature: `v1=${v1}` })).toBe(false);
    expect(mp.verifyWebhookSignature({ ...input, xSignature: "ts=1742505638683,v1=curto" })).toBe(false);
  });

  it("id alfanumérico entra em minúsculas e campos ausentes saem do manifesto", () => {
    const v1 = sign("id:abc;ts:1;");
    expect(mp.verifyWebhookSignature({ xSignature: `ts=1,v1=${v1}`, xRequestId: null, dataId: "ABC", secret })).toBe(true);
  });
});

describe("valores", () => {
  it("taxa em pontos-base arredondada para baixo e conversão para centavos", () => {
    expect(mp.platformFeeCents(5000, 500)).toBe(250);
    expect(mp.platformFeeCents(999, 500)).toBe(49);
    expect(mp.platformFeeCents(5000, 0)).toBe(0);
    expect(mp.toCents(75.76)).toBe(7576);
    expect(mp.toCents(0.1 + 0.2)).toBe(30);
    expect(mp.toCents(Number.NaN)).toBe(-1);
  });

  it("ingresso pago só fica disponível com pagamento conectado", () => {
    const paid = { price_cents: 5000, sales_start_at: null, sales_end_at: null, sold_out: false };
    expect(ticketAvailability(paid)).toBe("paid");
    expect(ticketAvailability(paid, new Date(), true)).toBe("available");
    expect(ticketAvailability({ ...paid, sold_out: true }, new Date(), true)).toBe("sold_out");
  });
});

describe("chamadas ao Mercado Pago", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("checkout leva taxa, referência, prazo e token do vendedor; sem boleto", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "pref-1", init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const expiresAt = new Date("2026-11-01T12:30:00Z");
    const result = await mp.createCheckout("TOKEN-VENDEDOR", {
      registrationId: "reg-1",
      title: "Congresso · Inteira",
      priceCents: 5000,
      platformFeeCents: 250,
      payer: { name: "Maria", email: "maria@exemplo.com" },
      expiresAt,
      notificationUrl: "https://app.test/api/v1/webhooks/mercadopago",
      returnUrl: "https://app.test/org/ev/inscricao/x",
      organization: { id: "org-1", name: "Ministério Jovem" },
    });
    expect(result).toEqual({ id: "pref-1", url: expect.stringMatching(/^https:\/\//) });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/checkout/preferences");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN-VENDEDOR");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      external_reference: "reg-1",
      metadata: { organization_id: "org-1", organization_name: "Ministério Jovem" },
      marketplace_fee: 2.5,
      items: [{ unit_price: 50, quantity: 1, currency_id: "BRL" }],
      expiration_date_to: expiresAt.toISOString(),
      payment_methods: { excluded_payment_types: [{ id: "ticket" }] },
    });
  });

  it("consulta normaliza o pagamento e erro HTTP não vaza resposta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({ id: 42, status: "approved", status_detail: "accredited", external_reference: "reg-1", transaction_amount: 50, currency_id: "BRL", collector_id: 123 }),
    ));
    await expect(mp.getPayment("T", "42")).resolves.toEqual({
      id: "42", status: "approved", statusDetail: "accredited", externalReference: "reg-1", amountCents: 5000, currency: "BRL", collectorId: "123",
    });
    await expect(mp.getPayment("T", "../tokens")).rejects.toThrow("id inválido");

    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"token APP_USR-xyz inválido"}', { status: 401 })));
    await expect(mp.getPayment("T", "42")).rejects.toThrow(/^Mercado Pago: falha em consulta \(HTTP 401\)$/);

    // Dona da aplicação: só o user_id do client_credentials sai da função, nunca o token.
    const appFetch = vi.fn(async () => Response.json({ access_token: "APP_USR-segredo", user_id: 181001800 }));
    vi.stubGlobal("fetch", appFetch);
    await expect(mp.appOwnerUserId({ clientId: "1", clientSecret: "s" })).resolves.toBe("181001800");
    expect(JSON.parse(String((appFetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ grant_type: "client_credentials" });

    // O cause entra no erro (diagnóstico do Pix), com credenciais mascaradas; o message não.
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"token APP_USR-xyz","cause":[{"code":13253,"description":"sem chave APP_USR-abc-1"}]}', { status: 400 })));
    await expect(mp.getPayment("T", "42")).rejects.toThrow(/^Mercado Pago: falha em consulta \(HTTP 400\): cause 13253 sem chave \*\*\*$/);
  });

  it("reembolso total com token do vendedor e idempotência por pagamento", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await mp.refundPayment("APP_USR-seller", "555");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/v1/payments/555/refunds");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer APP_USR-seller", "X-Idempotency-Key": "refund-555" });
    await expect(mp.refundPayment("APP_USR-seller", "../1")).rejects.toThrow(mp.PaymentProviderError);
  });

  it("autorização usa PKCE S256", () => {
    const { verifier, challenge } = mp.pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const url = new URL(mp.authorizationUrl({ clientId: "1", redirectUri: "https://app.test/cb", state: "s", codeChallenge: challenge }));
    expect(url.origin).toBe("https://auth.mercadopago.com");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ code_challenge_method: "S256", code_challenge: challenge, state: "s", platform_id: "mp" });
  });
});

describe("Pix", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("cria Pix com taxa, referência, idempotência por inscrição e prazo de 31 min após a reserva", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: 99, status: "pending", point_of_interaction: { transaction_data: { qr_code: "00020126PIX", qr_code_base64: "x" } } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const expiresAt = new Date("2026-11-01T12:30:00Z");
    const result = await mp.createPix("TOKEN-VENDEDOR", {
      registrationId: "reg-1",
      title: "Congresso · Inteira",
      priceCents: 5000,
      platformFeeCents: 250,
      payer: { name: "Maria", email: "maria@exemplo.com" },
      expiresAt,
      notificationUrl: "https://app.test/api/v1/webhooks/mercadopago",
      organization: { id: "org-1", name: "Ministério Jovem" },
    });
    expect(result).toEqual({ id: "99", code: "00020126PIX" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/v1/payments");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer TOKEN-VENDEDOR");
    expect(headers["X-Idempotency-Key"]).toBe("pix-reg-1");
    expect(JSON.parse(String(init.body))).toMatchObject({
      payment_method_id: "pix",
      transaction_amount: 50,
      application_fee: 2.5,
      external_reference: "reg-1",
      payer: { email: "maria@exemplo.com" },
      date_of_expiration: "2026-11-01T13:01:00.000Z",
    });
  });

  it("resposta sem código Pix vira erro do provedor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: 99 })));
    await expect(
      mp.createPix("T", {
        registrationId: "r",
        title: "t",
        priceCents: 100,
        platformFeeCents: 0,
        payer: { name: "a", email: "a@b.c" },
        expiresAt: new Date(),
        notificationUrl: "https://x.test",
        organization: { id: "o", name: "o" },
      }),
    ).rejects.toBeInstanceOf(mp.PaymentProviderError);
  });
});

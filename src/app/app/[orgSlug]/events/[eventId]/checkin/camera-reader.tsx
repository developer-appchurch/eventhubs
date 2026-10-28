"use client";

import jsQR from "jsqr";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { parseCheckinCode } from "@/modules/checkins/code";

// Foto da câmera do celular: o QR é lido no navegador, sem enviar a imagem ao servidor.
const MAX_SIDE = 1280;

async function readQr(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height)?.data ?? null;
}

export function CameraReader() {
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    const text = await readQr(file).catch(() => null);
    const code = parseCheckinCode(text ?? undefined);
    setBusy(false);
    if (!code) {
      setMessage("Não encontrei um QR de check-in nesta foto. Tente de mais perto, com boa luz, ou digite o código.");
      return;
    }
    router.replace(`${pathname}?code=${code}`);
  }

  return (
    <div className="grid gap-2">
      <label className={buttonClass("secondary", "min-h-12 cursor-pointer px-6")}>
        {busy ? "Lendo QR…" : "Ler QR com a câmera"}
        <input type="file" accept="image/*" capture="environment" onChange={onPhoto} disabled={busy} className="sr-only" />
      </label>
      {message ? <Alert tone="warning">{message}</Alert> : null}
    </div>
  );
}

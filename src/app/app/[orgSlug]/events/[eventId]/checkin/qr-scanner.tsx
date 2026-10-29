"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cameraErrorMessage, parseCheckinCode } from "@/modules/checkins/code";

type Detect = (video: HTMLVideoElement) => Promise<string | null>;

// Leitor nativo (Chrome/Android) quando existe; senão jsQR, baixado só aqui e só ao abrir a câmera.
async function createDetector(): Promise<Detect> {
  const Native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(s: CanvasImageSource): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (Native) {
    const detector = new Native({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return async (video) => {
    // Reduz o quadro: QR de ingresso é grande na tela e o celular processa bem menos pixels.
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

export function QrScanner() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();
        const detect = await createDetector();
        const tick = async () => {
          if (stopped) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            const raw = await detect(video).catch(() => null);
            if (stopped) return;
            const code = raw ? parseCheckinCode(raw) : null;
            if (code) {
              setOpen(false);
              // Mantém o evento escolhido na tela do menu (?evento=); troca só o código.
              const next = new URLSearchParams(searchParams);
              next.delete("q");
              next.delete("page");
              next.set("code", code);
              router.push(`${pathname}?${next}`);
              return;
            }
            if (raw) setHint("Este QR Code não é de um ingresso deste sistema.");
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (e) {
        if (!stopped) {
          setError(cameraErrorMessage(e));
          setOpen(false);
        }
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, pathname, router, searchParams]);

  return (
    <div className="grid gap-3">
      {open ? (
        <div className="grid gap-3">
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-(--radius-card) bg-black shadow-(--shadow-card)">
            <video ref={videoRef} muted playsInline aria-label="Imagem da câmera" className="size-full object-cover" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-brand-400 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
          </div>
          <p role="status" className="text-center text-sm text-ink-muted">
            {hint ?? "Aponte a câmera para o QR Code do ingresso."}
          </p>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Fechar câmera
          </Button>
        </div>
      ) : (
        <Button
          className="min-h-12 w-full sm:w-auto"
          onClick={() => {
            setError(null);
            setHint(null);
            setOpen(true);
          }}
        >
          <Icon name="qr" />
          Ler QR Code
        </Button>
      )}
      {error ? <Alert tone="warning">{error}</Alert> : null}
    </div>
  );
}

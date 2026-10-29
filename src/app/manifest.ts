import type { MetadataRoute } from "next";

// Sem manifesto, o atalho na tela inicial adota como escopo a pasta da página onde foi salvo,
// e qualquer tela fora dela abre com a barra de endereço. scope "/" cobre o app inteiro.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EventHub",
    short_name: "EventHub",
    description: "Crie eventos, receba inscrições e acompanhe a presença em um único lugar.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#211044",
    theme_color: "#211044",
    // Gerados do favicon sobre fundo branco; o iPhone usa src/app/apple-icon.png (180px).
    icons: [
      { src: "/brand/app-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}

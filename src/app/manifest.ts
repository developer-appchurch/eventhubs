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
    // shortcut: ícone de 71x76; com um PNG quadrado de 192 e 512px o Android oferece "Instalar app".
    icons: [{ src: "/brand/favicon.png", sizes: "71x76", type: "image/png" }],
  };
}

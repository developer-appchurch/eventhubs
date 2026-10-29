import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EventHub", template: "%s · EventHub" },
  description: "Crie eventos, receba inscrições e acompanhe a presença em um único lugar.",
  // iPhone: o atalho da tela inicial abre como app, sem a barra do Safari.
  appleWebApp: { capable: true, title: "EventHub" },
};

// Todas as rotas leem sessão ou configuração em tempo de requisição; nada é pré-renderizado
// no build, então o build não depende de variáveis de ambiente de produção.
export const dynamic = "force-dynamic";

// Teto de execução por requisição (segundos): uma função presa não vira conta alta.
export const maxDuration = 30;

export const viewport: Viewport = {
  themeColor: "#211044",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-(--shadow-overlay)"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}

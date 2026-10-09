import type { Metadata } from "next";
import { Anton, Inter, Noto_Sans_JP } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { MuiProviders } from "@/components/MuiProviders";
import { TitlePreferenceProvider } from "@/lib/titlePreference";
import { CurrentUserProvider } from "@/lib/auth/useCurrentUser";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
});

const inter = Inter({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-inter",
});

const notoSansJP = Noto_Sans_JP({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-noto-jp",
});

export const metadata: Metadata = {
  title: "Anime Hub",
  description: "Seu catálogo pessoal de animes, lançamentos e progresso.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${anton.variable} ${inter.variable} ${notoSansJP.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ink">
        {/* Skip-link (VIS/VT-A): primeiro item focável da página; só aparece com foco. */}
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        <AppRouterCacheProvider>
          <MuiProviders>
            <CurrentUserProvider>
              <TitlePreferenceProvider>
                {/* Landmark de leitor de tela — sem isso não havia nenhum
                    <main>/<nav> em toda a árvore, então "pular pro conteúdo"
                    não tinha destino nenhum (achado real da 12ª rodada de
                    auditoria, Epic 18, confirmado e corrigido na 13ª). Cada
                    página já injeta seu próprio <Header/>, então este <main>
                    só envolve o restante do conteúdo. */}
                <main id="conteudo" tabIndex={-1} className="flex flex-1 flex-col">
                  {children}
                </main>
              </TitlePreferenceProvider>
            </CurrentUserProvider>
          </MuiProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}

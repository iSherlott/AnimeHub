import type { Metadata } from "next";
import { Anton, Inter, Noto_Sans_JP } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { MuiProviders } from "@/components/MuiProviders";
import { TitlePreferenceProvider } from "@/lib/titlePreference";
import { CurrentUserProvider } from "@/lib/auth/useCurrentUser";
import { getCurrentUser, toPublicUser } from "@/lib/auth/session";
import { SiteFooter } from "@/components/SiteFooter";
import { ScrollToTop } from "@/components/ScrollToTop";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
});

// Inter e Noto Sans JP são fontes variáveis: um arquivo cobre todos os pesos. Com os pesos listados um a um, a Noto
// Sans JP (fatiada pelo Google em ~120 faixas de caracteres) virava 372 @font-face num CSS de 100 KB que travava a
// primeira pintura de toda página; a Inter, 4 arquivos pré-carregados em vez de 1.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// Só os títulos em japonês usam: não precisa ser pré-carregada (o navegador baixa as faixas quando aparecem).
const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-jp",
  preload: false,
});

export const metadata: Metadata = {
  title: "Anime Hub",
  description: "Seu catálogo pessoal de animes, lançamentos e progresso.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Quem está olhando já vai junto com a página (ver CurrentUserProvider). Pelo JSON, no mesmo formato do /api/auth/me.
  const sessionUser = await getCurrentUser();
  const initialUser = sessionUser ? (JSON.parse(JSON.stringify(toPublicUser(sessionUser))) as ReturnType<typeof toPublicUser>) : null;
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
            <CurrentUserProvider initialUser={initialUser}>
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
                <SiteFooter />
                <ScrollToTop />
              </TitlePreferenceProvider>
            </CurrentUserProvider>
          </MuiProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}

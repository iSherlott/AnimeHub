import type { Metadata } from "next";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { CommunityNav } from "@/components/CommunityNav";
import { CommunitySidebar } from "@/components/CommunitySidebar";
import { NewsView } from "@/components/NewsView";
import { PageContainer, PageIntro, TwoColumn } from "@/components/PageShell";

export const metadata: Metadata = { title: "Notícias · Anime Hub" };

/**
 * Comunidade → Notícias: o que saiu sobre as obras da temporada atual (serviço
 * news-fetcher → Jikan/MyAnimeList). Pública; "Que sigo" pede conta.
 */
export default function NewsPage() {
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="会話 / COMUNIDADE" title="Comunidade" subtitle="Histórias que continuam na conversa." />
        <CommunityNav current="news" />
        <TwoColumn main={<NewsView />} aside={<CommunitySidebar />} />
      </PageContainer>
    </Box>
  );
}

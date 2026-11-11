import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Box, Chip, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { CoverImage } from "@/components/CoverImage";
import { LinkButton } from "@/components/LinkButton";
import { PageContainer } from "@/components/PageShell";
import { loadRecommendationLink } from "@/lib/recommendationLinks";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

/** A prévia do link no WhatsApp: quem recomendou, a obra e a capa. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const rec = await loadRecommendationLink(code);
  if (!rec) return { title: "Anime Hub" };
  const title = `${rec.from} recomendou ${rec.work.titleRomaji}`;
  const description = rec.note ?? rec.work.synopsis?.slice(0, 180) ?? "Uma recomendação no AnimeHub.";
  return {
    title: `${title} · Anime Hub`,
    description,
    openGraph: { title, description, images: rec.work.coverImage ? [rec.work.coverImage] : undefined },
  };
}

/**
 * Recomendação por link (11/11/2026): a página que quem NÃO tem conta abre. Mostra a obra, a sinopse e o recado de quem
 * recomendou, e leva à página da obra no catálogo (aberta a visitantes).
 */
export default async function RecommendationLinkPage({ params }: Props) {
  const { code } = await params;
  const rec = await loadRecommendationLink(code, { countView: true });
  if (!rec) notFound();
  const { work } = rec;
  const meta = [work.format, work.seasonYear ? String(work.seasonYear) : null, work.episodes ? `${work.episodes} episódios` : null].filter(Boolean).join(" · ");

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <Box
          component="article"
          data-testid="recommendation-link"
          sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "200px 1fr", md: "260px 1fr" }, gap: { xs: 3, md: 5 }, alignItems: "start", maxWidth: 980 }}
        >
          <Box sx={{ position: "relative", width: { xs: 180, sm: "100%" }, aspectRatio: "2 / 3", borderRadius: "12px", overflow: "hidden", bgcolor: "#171820", boxShadow: 6, justifySelf: { xs: "center", sm: "stretch" } }}>
            {work.coverImage && <CoverImage src={work.coverImage} sizes="(max-width: 600px) 180px, 260px" />}
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "primary.main" }}>
              おすすめ / {rec.from} recomendou para você
            </Typography>
            <Box>
              <Typography component="h1" sx={{ fontSize: { xs: 28, md: 40 }, fontWeight: 700, lineHeight: 1.15, textWrap: "balance" }}>
                {work.titleRomaji}
              </Typography>
              {(work.titleEnglish || work.titleNative) && (
                <Typography sx={{ mt: 0.5, color: "text.secondary", fontSize: 15 }}>{[work.titleEnglish, work.titleNative].filter(Boolean).join(" · ")}</Typography>
              )}
              {meta && <Typography sx={{ mt: 0.5, color: "text.secondary", fontSize: 13 }}>{meta}</Typography>}
            </Box>
            {rec.note && (
              <Box component="blockquote" data-testid="recommendation-note" sx={{ m: 0, pl: 2, py: 1, borderLeft: 3, borderColor: "secondary.main", bgcolor: "rgba(255,255,255,0.03)", borderRadius: "0 8px 8px 0" }}>
                <Typography sx={{ fontSize: 17, lineHeight: 1.5 }}>“{rec.note}”</Typography>
                <Typography sx={{ mt: 0.5, fontSize: 13, color: "text.secondary" }}>— {rec.from}</Typography>
              </Box>
            )}
            {work.genres.length > 0 && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {work.genres.slice(0, 6).map((g) => (
                  <Chip key={g} label={g} size="small" variant="outlined" />
                ))}
              </Box>
            )}
            {work.synopsis && <Typography sx={{ color: "text.secondary", lineHeight: 1.65, maxWidth: "65ch", whiteSpace: "pre-line" }}>{work.synopsis}</Typography>}
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
              <LinkButton href={`/anime/${work.key}`} variant="contained" data-testid="recommendation-open-work">
                Ver a obra no AnimeHub
              </LinkButton>
              <LinkButton href="/calendar" variant="outlined">
                Calendário de lançamentos
              </LinkButton>
            </Box>
            <Typography sx={{ fontSize: 13, color: "text.secondary", maxWidth: "65ch" }}>
              O AnimeHub é uma rede fechada: as contas são criadas pela administração. Para acompanhar a obra e conversar com {rec.from} por aqui, peça a {rec.from} que fale com a administração.
            </Typography>
          </Box>
        </Box>
      </PageContainer>
    </Box>
  );
}

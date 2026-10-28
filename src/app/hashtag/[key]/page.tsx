import { notFound } from "next/navigation";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { HashtagView } from "@/components/HashtagView";
import { AppLink } from "@/components/AppLink";
import { LinkButton } from "@/components/LinkButton";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { prisma } from "@/lib/prisma";
import { canonicalHashtagKey } from "@/lib/hashtags";
import { currentSeasonTag } from "@/lib/season";

type Params = { params: Promise<{ key: string }> };

/**
 * Página de hashtag canônica (Figma `13:42068`) — leitura pública. Existe
 * para qualquer ID canônico válido: sem publicações, mostra o vazio em vez
 * de 404 (a lateral "Conversas da temporada" aponta para a tag da temporada
 * mesmo antes da primeira publicação).
 */
export default async function HashtagPage({ params }: Params) {
  const { key: rawKey } = await params;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawKey);
  } catch {
    notFound();
  }
  const key = canonicalHashtagKey(decoded);
  if (!key || key.length > 80 || /[^\p{L}\p{N}_\p{M}]/u.test(key)) notFound();

  const hashtag = await prisma.hashtag.findUnique({ where: { key }, select: { key: true, display: true } });
  const display = hashtag?.display ?? decoded;

  const season = currentSeasonTag(new Date());
  const subtitle =
    key === season.key
      ? `Conversas sobre a temporada ${season.label} / ${season.labelPt} ${season.year}.`
      : `Conversas com #${display}.`;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro
          kicker="会話 / COMUNIDADE"
          title={`#${display}`}
          subtitle={subtitle}
          action={
            <LinkButton href="/publicar" variant="contained">
              + Nova publicação
            </LinkButton>
          }
        />
        <AppLink href="/" underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Comunidade / Para você
        </AppLink>
        <HashtagView hashtagKey={key} display={display} />
      </PageContainer>
    </Box>
  );
}

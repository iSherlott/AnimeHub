import type { Metadata } from "next";
import { Box, Chip, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { AnimeTitle } from "@/components/AnimeTitle";
import { CoverImage } from "@/components/CoverImage";
import { LinkButton } from "@/components/LinkButton";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { getCurrentUser } from "@/lib/auth/session";
import { myCommunities } from "@/lib/community";
import { formatRelativeTime } from "@/lib/relativeTime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minhas comunidades · Anime Hub" };

/** "Minhas comunidades": os fóruns em que a pessoa entrou, com o que teve atividade desde a última visita primeiro. */
export default async function MyCommunitiesPage() {
  const user = await getCurrentUser();
  const cards = user ? await myCommunities(user.id) : [];
  const now = new Date();

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="コミュニティ / COMUNIDADES" title="Minhas comunidades" subtitle="O fórum de cada anime em que você participa. Para achar uma comunidade, abra a página do anime." />
        {!user ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
            <Typography sx={{ color: "text.secondary" }}>Entre na sua conta para ver as comunidades de que você participa.</Typography>
            <LinkButton href="/login?next=%2Fcomunidades" variant="contained">
              Entrar
            </LinkButton>
          </Box>
        ) : cards.length === 0 ? (
          <Typography sx={{ color: "text.secondary" }} data-testid="my-communities-empty">
            Você ainda não participa de nenhuma comunidade. Na página de um anime, abra a comunidade dele e clique em &quot;Participar&quot;.
          </Typography>
        ) : (
          <Box component="ul" data-testid="my-communities" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0,1fr))" }, gap: 2 }}>
            {cards.map((c) => (
              <Box component="li" key={c.communityId} data-testid={`my-community-${c.key}`} sx={{ display: "flex", gap: 2, p: 1.5, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper" }}>
                <Box sx={{ position: "relative", width: 64, aspectRatio: "2 / 3", borderRadius: "8px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>
                  {c.root.coverImage && <CoverImage src={c.root.coverImage} sizes="64px" />}
                </Box>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
                  <AppLink href={`/comunidades/${c.key}`} underline="hover" sx={{ fontSize: 16, fontWeight: 700, color: "text.primary", overflowWrap: "anywhere" }}>
                    <AnimeTitle titles={{ titleRomaji: c.root.titleRomaji, titleEnglish: c.root.titleEnglish, titleNative: c.root.titleNative }} />
                  </AppLink>
                  <Typography sx={{ fontSize: 13, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                    {c.members} {c.members === 1 ? "membro" : "membros"} · {c.topics} {c.topics === 1 ? "tópico" : "tópicos"}
                    {c.lastActivityAt ? ` · última atividade ${formatRelativeTime(c.lastActivityAt, now)}` : ""}
                  </Typography>
                  {c.newActivity > 0 && <Chip size="small" color="primary" label={`${c.newActivity} com novidade${c.newActivity === 1 ? "" : "s"}`} sx={{ alignSelf: "flex-start" }} data-testid={`my-community-new-${c.key}`} />}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </PageContainer>
    </Box>
  );
}

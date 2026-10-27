import type { Metadata } from "next";
import { Box, Button, Chip, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { AnimeTitle } from "@/components/AnimeTitle";
import { CoverImage } from "@/components/CoverImage";
import { LinkButton } from "@/components/LinkButton";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { getCurrentUser } from "@/lib/auth/session";
import { myCommunities, popularCommunities, searchCommunities, type CommunityLink } from "@/lib/community";
import { formatRelativeTime } from "@/lib/relativeTime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comunidades · Anime Hub" };

type Tab = "minhas" | "populares" | "buscar";
type Props = { searchParams: Promise<{ aba?: string; q?: string }> };

/** Cartão de comunidade do diretório (capa, nome do anime, membros). */
function CommunityTile({ c }: { c: CommunityLink }) {
  return (
    <Box component="li" data-testid={`directory-${c.key}`} sx={{ listStyle: "none" }}>
      <AppLink href={`/comunidades/${c.key}`} underline="none" sx={{ display: "flex", flexDirection: "column", gap: 0.75, color: "text.primary", "&:hover .name": { textDecoration: "underline" } }}>
        <Box sx={{ position: "relative", aspectRatio: "2 / 3", borderRadius: "10px", overflow: "hidden", bgcolor: "#171820" }}>{c.coverImage && <CoverImage src={c.coverImage} sizes="160px" />}</Box>
        <Typography className="name" sx={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>
          <AnimeTitle titles={{ titleRomaji: c.titleRomaji, titleEnglish: c.titleEnglish, titleNative: c.titleNative }} />
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
          {c.members} {c.members === 1 ? "membro" : "membros"}
        </Typography>
      </AppLink>
    </Box>
  );
}

const gridSx = { m: 0, p: 0, display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", sm: "repeat(4, minmax(0,1fr))", lg: "repeat(6, minmax(0,1fr))" }, gap: 2 } as const;

/**
 * Comunidades: o diretório dos fóruns dos animes — as minhas (com o que teve novidade desde a última
 * visita), as mais populares e a busca pelo nome do anime. Cada anime tem a sua comunidade, mesmo antes do primeiro membro.
 */
export default async function CommunitiesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const q = (sp.q ?? "").trim().slice(0, 80);
  const mine = user ? await myCommunities(user.id) : [];
  const tab: Tab = sp.aba === "buscar" || q ? "buscar" : sp.aba === "populares" || sp.aba === "minhas" ? sp.aba : user && mine.length > 0 ? "minhas" : "populares";
  const [popular, found] = await Promise.all([tab === "populares" ? popularCommunities() : Promise.resolve([]), tab === "buscar" ? searchCommunities(q) : Promise.resolve([])]);
  const now = new Date();
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "minhas", label: `Minhas${user ? ` · ${mine.length}` : ""}` },
    { key: "populares", label: "Populares" },
    { key: "buscar", label: "Buscar" },
  ];

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="コミュニティ / COMUNIDADES" title="Comunidades" subtitle="O fórum de cada anime: tópicos, enquetes, eventos e quem curte a mesma obra." />
        <Box component="nav" aria-label="Comunidades" sx={{ display: "flex", gap: 3, borderBottom: 1, borderColor: "divider" }} data-testid="communities-tabs">
          {tabs.map((t) => (
            <AppLink key={t.key} href={`/comunidades?aba=${t.key}`} underline="none" aria-current={tab === t.key ? "page" : undefined} data-testid={`communities-tab-${t.key}`} sx={{ pb: 1.25, fontSize: 14, fontWeight: 700, color: tab === t.key ? "text.primary" : "text.secondary", borderBottom: 2, borderColor: tab === t.key ? "primary.main" : "transparent", mb: "-1px" }}>
              {t.label}
            </AppLink>
          ))}
        </Box>

        {tab === "minhas" &&
          (!user ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
              <Typography sx={{ color: "text.secondary" }}>Entre na sua conta para ver as comunidades de que você participa.</Typography>
              <LinkButton href="/login?next=%2Fcomunidades" variant="contained">
                Entrar
              </LinkButton>
            </Box>
          ) : mine.length === 0 ? (
            <Typography sx={{ color: "text.secondary" }} data-testid="my-communities-empty">
              Você ainda não participa de nenhuma comunidade. Veja as populares ou busque o anime que você curte.
            </Typography>
          ) : (
            <Box component="ul" data-testid="my-communities" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0,1fr))" }, gap: 2 }}>
              {mine.map((c) => (
                <Box component="li" key={c.communityId} data-testid={`my-community-${c.key}`} sx={{ display: "flex", gap: 2, p: 1.5, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper" }}>
                  <Box sx={{ position: "relative", width: 64, aspectRatio: "2 / 3", borderRadius: "8px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>{c.root.coverImage && <CoverImage src={c.root.coverImage} sizes="64px" />}</Box>
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
          ))}

        {tab === "populares" &&
          (popular.length === 0 ? (
            <Typography sx={{ color: "text.secondary" }}>Nenhuma comunidade com membros ainda. Busque um anime e seja a primeira pessoa a participar.</Typography>
          ) : (
            <Box component="ul" sx={gridSx} data-testid="popular-communities">
              {popular.map((c) => (
                <CommunityTile key={c.key} c={c} />
              ))}
            </Box>
          ))}

        {tab === "buscar" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box component="form" action="/comunidades" method="get" role="search" aria-label="Buscar comunidades" sx={{ display: "flex", gap: 1 }}>
              <input type="hidden" name="aba" value="buscar" />
              <Box component="input" name="q" defaultValue={q} placeholder="Nome do anime (romaji, inglês ou japonês)" aria-label="Buscar comunidade pelo nome do anime" data-testid="communities-search" sx={{ flex: 1, minWidth: 0, px: 2, py: 1.25, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: "#171820", color: "text.primary", fontSize: 15 }} />
              <Button type="submit" variant="contained" data-testid="communities-search-submit">
                Buscar
              </Button>
            </Box>
            {q.length >= 2 && found.length === 0 && <Typography sx={{ color: "text.secondary" }}>Nenhum anime na plataforma com esse nome.</Typography>}
            {found.length > 0 && (
              <Box component="ul" sx={gridSx} data-testid="search-communities">
                {found.map((c) => (
                  <CommunityTile key={c.key} c={c} />
                ))}
              </Box>
            )}
          </Box>
        )}
      </PageContainer>
    </Box>
  );
}

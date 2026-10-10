import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureProduction, parseRelations, parseStreamingLinks } from "@/lib/production";
import { Header } from "@/components/Header";
import { AnimeTitle } from "@/components/AnimeTitle";
import { AppLink } from "@/components/AppLink";
import { CoverImage, BackdropImage } from "@/components/CoverImage";
import { FollowProductionButton } from "@/components/FollowProductionButton";
import { HashtagRow } from "@/components/HashtagRow";
import { NextEpisodeBlock } from "@/components/NextEpisodeBlock";
import { PageContainer } from "@/components/PageShell";
import { PublishAboutButton } from "@/components/PublishAboutButton";
import { SynopsisText } from "@/components/SynopsisText";
import { RelatedWorkCard } from "@/components/RelatedWorkCard";
import { UserPostList } from "@/components/UserPostList";
import { PlatformLinksManager } from "@/components/PlatformLinksManager";
import { WatchLinks } from "@/components/WatchLinks";

/**
 * Detalhe PÚBLICO da produção (D-03, aprovada; Figma `8:1953`): visitante
 * lê tudo; só "Acompanhar" exige login. Conteúdo vem da `Production`
 * canônica — não da linha `Anime` de nenhum usuário. A sinopse é renderizada
 * como texto puro (nunca HTML de terceiros).
 */

const FORMAT_LABEL: Record<string, string> = {
  TV: "TV",
  TV_SHORT: "TV curta",
  MOVIE: "Filme",
  OVA: "OVA",
  ONA: "ONA",
  SPECIAL: "Especial",
  MUSIC: "Música",
};

const STATUS_LABEL: Record<string, string> = {
  RELEASING: "Em exibição",
  FINISHED: "Finalizado",
  NOT_YET_RELEASED: "Ainda não lançado",
  CANCELLED: "Cancelado",
  HIATUS: "Em hiato",
};

const SEASON_LABEL: Record<string, string> = {
  WINTER: "Inverno",
  SPRING: "Primavera",
  SUMMER: "Verão",
  FALL: "Outono",
};

const RELATION_LABEL: Record<string, string> = {
  PREQUEL: "Anterior",
  SEQUEL: "Continuação",
  PARENT: "Obra principal",
  SIDE_STORY: "História paralela",
  SPIN_OFF: "Derivado",
  ALTERNATIVE: "Versão alternativa",
  SUMMARY: "Resumo",
};

type Params = { params: Promise<{ anilistId: string }> };

function parseId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = parseId((await params).anilistId);
  if (!id) return { title: "Anime Hub" };
  const production = await prisma.production.findUnique({ where: { anilistId: id } });
  return { title: production ? `${production.titleRomaji} · Anime Hub` : "Anime Hub" };
}

export default async function ProductionPage({ params }: Params) {
  const id = parseId((await params).anilistId);
  if (!id) notFound();

  const production = await ensureProduction(id);
  if (!production) notFound();

  const user = await getCurrentUser();
  const [nextEpisode, owned, siblings, topTags] = await Promise.all([
    prisma.airingScheduleEntry.findFirst({
      where: { anilistId: id, airingAt: { gte: new Date() } },
      orderBy: { airingAt: "asc" },
    }),
    user
      ? prisma.anime.findUnique({
          where: { userId_anilistId: { userId: user.id, anilistId: id } },
          select: { id: true, platformLinks: { orderBy: { createdAt: "asc" }, select: { id: true, platform: true, url: true } } },
        })
      : Promise.resolve(null),
    prisma.production.findMany({
      where: { franchiseId: production.franchiseId, NOT: { id: production.id } },
      orderBy: [{ seasonNumber: "asc" }, { seasonYear: "asc" }],
      select: { anilistId: true, titleRomaji: true, titleNative: true, titleEnglish: true, coverImage: true, seasonNumber: true, format: true },
    }),
    // Hashtags mais usadas nas discussões desta obra (Figma 13:42469).
    prisma.postHashtag.groupBy({
      by: ["hashtagId"],
      where: { post: { anilistId: id, deletedAt: null } },
      _count: { _all: true },
      orderBy: { _count: { hashtagId: "desc" } },
      take: 3,
    }),
  ]);
  const tagRows = topTags.length
    ? await prisma.hashtag.findMany({ where: { id: { in: topTags.map((t) => t.hashtagId) } }, select: { id: true, key: true, display: true } })
    : [];
  const orderedTags = topTags.map((t) => tagRows.find((r) => r.id === t.hashtagId)).filter((t): t is NonNullable<typeof t> => Boolean(t));

  const genres = production.genres ? production.genres.split(",").filter(Boolean) : [];
  const related = parseRelations(production.relationsJson);
  const knownSiblingIds = new Set(siblings.map((s) => s.anilistId));
  const unknownRelated = related.filter((r) => !knownSiblingIds.has(r.id));

  // Próximo horário de cada obra da franquia (uma consulta só).
  const siblingAirings = siblings.length
    ? await prisma.airingScheduleEntry.findMany({
        where: { anilistId: { in: siblings.map((s) => s.anilistId) }, airingAt: { gte: new Date() } },
        orderBy: { airingAt: "asc" },
        select: { anilistId: true, airingAt: true },
      })
    : [];
  const nextBySibling = new Map<number, Date>();
  for (const a of siblingAirings) if (!nextBySibling.has(a.anilistId)) nextBySibling.set(a.anilistId, a.airingAt);

  const info: Array<[string, string]> = [
    ["Tipo", production.format ? (FORMAT_LABEL[production.format] ?? production.format) : "—"],
    [
      "Temporada",
      production.season && production.seasonYear
        ? `${SEASON_LABEL[production.season] ?? production.season} ${production.seasonYear}`
        : production.seasonYear
          ? String(production.seasonYear)
          : "—",
    ],
    ["Status", production.status ? (STATUS_LABEL[production.status] ?? production.status) : "—"],
    ["Episódios", production.episodes ? String(production.episodes) : "—"],
    ["Produção", `Temporada ${production.seasonNumber}`],
    ["Franquia", production.franchise.name],
  ];

  const titlePrimary = production.titleNative ?? production.titleRomaji;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />

      <PageContainer wide>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          <AppLink href="/discover" underline="hover" color="inherit">
            EXPLORAR
          </AppLink>{" "}
          / <span lang={production.titleNative ? "ja" : undefined}>{titlePrimary}</span>
        </Typography>

        {/* Hero do anime */}
        <Box
          sx={{
            position: "relative",
            overflow: "hidden",
            bgcolor: "background.paper",
            borderRadius: "16px",
            p: 4,
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            gap: 5,
            alignItems: "flex-start",
          }}
        >
          {production.bannerImage && (
            <Box aria-hidden sx={{ position: "absolute", top: 0, right: 0, width: "60%", height: 550, opacity: 0.13, pointerEvents: "none" }}>
              <BackdropImage src={production.bannerImage} />
            </Box>
          )}
          <Box
            sx={{
              position: "relative",
              flexShrink: 0,
              width: { xs: 200, md: 280 },
              aspectRatio: "2 / 3",
              borderRadius: "12px",
              overflow: "hidden",
              bgcolor: "#171820",
            }}
          >
            {production.coverImage && <CoverImage src={production.coverImage} sizes="280px" />}
          </Box>
          <Box sx={{ position: "relative", minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              {production.status ? (STATUS_LABEL[production.status] ?? production.status) : ""}
              {production.status && production.format ? " · " : ""}
              {production.format ? (FORMAT_LABEL[production.format] ?? production.format) : ""}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography component="h1" className={production.titleNative ? "font-jp" : undefined} sx={{ fontSize: { xs: 28, md: 40 }, fontWeight: 700, lineHeight: 1.5 }}>
                <AnimeTitle
                  titles={{
                    titleRomaji: production.titleRomaji,
                    titleEnglish: production.titleEnglish,
                    titleNative: production.titleNative,
                  }}
                />
              </Typography>
              {production.titleEnglish && production.titleEnglish !== titlePrimary && (
                <Typography sx={{ fontSize: 20, color: "text.secondary" }}>{production.titleEnglish}</Typography>
              )}
              {production.titleNative && production.titleRomaji !== production.titleEnglish && (
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{production.titleRomaji}</Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <FollowProductionButton anilistId={id} initialAnimeId={owned?.id ?? null} loggedIn={Boolean(user)} />
              {!user && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Entre para criar sua agenda pessoal.</Typography>}
            </Box>
            <NextEpisodeBlock iso={nextEpisode ? nextEpisode.airingAt.toISOString() : null} episode={nextEpisode ? nextEpisode.episode : null} />
          </Box>
        </Box>

        {/* Navegação contextual (âncoras): Visão geral · Discussões */}
        <Box component="nav" aria-label="Seções da obra" sx={{ display: "flex", gap: 4, borderBottom: 1, borderColor: "divider" }}>
          <AppLink href="#visao-geral" underline="none" aria-current="location" sx={{ pt: 2, pb: 1.5, fontSize: 14, fontWeight: 700, color: "text.primary", borderBottom: "2px solid", borderColor: "primary.main", mb: "-1px" }}>
            Visão geral
          </AppLink>
          <AppLink href="#discussoes" underline="none" sx={{ pt: 2, pb: 1.5, fontSize: 14, color: "text.secondary", borderBottom: "2px solid transparent", mb: "-1px" }}>
            Discussões
          </AppLink>
        </Box>

        <Box id="visao-geral" sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) minmax(0,360px)" }, columnGap: 5, rowGap: 4, alignItems: "start" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box component="section" aria-labelledby="sinopse-heading" sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <Typography id="sinopse-heading" component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
                Sinopse
              </Typography>
              <SynopsisText description={production.description} anilistId={production.anilistId} sx={{ fontSize: 16 }} />
            </Box>
            {genres.length > 0 && (
              <Box component="section" aria-labelledby="generos-heading" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Typography id="generos-heading" component="h2" sx={{ fontSize: 14, color: "text.secondary" }}>
                  GÊNEROS
                </Typography>
                <Box component="ul" sx={{ display: "flex", flexWrap: "wrap", gap: 3, listStyle: "none", p: 0, m: 0, fontSize: 16 }}>
                  {genres.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </Box>
              </Box>
            )}
          </Box>

          <Box component="section" aria-labelledby="info-heading" sx={{ bgcolor: "background.paper", borderRadius: "16px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography id="info-heading" component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
              Informações
            </Typography>
            <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 2, rowGap: 0.5, m: 0, fontSize: 14 }}>
              {info.map(([label, value]) => (
                <Box key={label} sx={{ display: "contents" }}>
                  <Typography component="dt" sx={{ fontSize: 14, color: "text.secondary" }}>
                    {label}
                  </Typography>
                  <Typography component="dd" sx={{ fontSize: 14, m: 0 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box component="section" aria-labelledby="watch-heading" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Typography id="watch-heading" component="h3" sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>
                Onde assistir
              </Typography>
              <WatchLinks links={parseStreamingLinks(production.streamingLinksJson)} />
            </Box>
            <Box component="section" aria-labelledby="my-source-heading" data-testid="my-watch-source" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Typography id="my-source-heading" component="h3" sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>
                Onde eu assisto
              </Typography>
              {owned ? (
                <PlatformLinksManager animeId={owned.id} initialLinks={owned.platformLinks} />
              ) : (
                <Typography data-testid="my-watch-source-hint" sx={{ fontSize: 14, color: "text.secondary" }}>
                  {user ? "Acompanhe esta obra para guardar o link do site onde você assiste." : "Entre e acompanhe esta obra para guardar o link do site onde você assiste."}
                </Typography>
              )}
            </Box>
            {production.officialSite && (
              <Box>
                <AppLink
                  href={production.officialSite}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="none"
                  data-testid="official-site"
                  sx={{ display: "inline-flex", alignItems: "center", minHeight: 44, px: 2, py: 1.5, borderRadius: "10px", bgcolor: "#171820", color: "text.primary", fontSize: 14, fontWeight: 700 }}
                >
                  ↗ Site oficial
                </AppLink>
              </Box>
            )}
            {production.officialSite && (
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Links externos abrem em outra aba.</Typography>
            )}
          </Box>
        </Box>

        {/* Discussões complementares */}
        <Box component="section" aria-labelledby="discussoes-heading" id="discussoes" data-testid="discussions" sx={{ borderTop: 1, borderColor: "divider", pt: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <Typography id="discussoes-heading" component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
              Discussões sobre esta obra
            </Typography>
            <PublishAboutButton anilistId={id} loggedIn={Boolean(user)} />
          </Box>
          <Typography sx={{ fontSize: 16, color: "text.secondary" }}>
            Impressões da comunidade · Temporada {production.seasonNumber}. Contexto explícito, spoilers protegidos.
          </Typography>
          <HashtagRow tags={orderedTags.map((t) => ({ key: t.key, display: t.display }))} />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) 320px" }, columnGap: 5, rowGap: 3, alignItems: "start" }}>
            <UserPostList
              endpoint="/api/posts"
              params={{ tab: "recent", anilistId: String(id) }}
              timeStyle="relative"
              emptyText="Esta obra ainda não tem discussões. Seja a primeira pessoa a compartilhar uma impressão."
            />
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Typography lang={production.titleNative ? "ja" : undefined} sx={{ fontSize: 20, fontWeight: 700 }}>
                  {titlePrimary}
                </Typography>
                {production.titleEnglish && production.titleEnglish !== titlePrimary && (
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{production.titleEnglish}</Typography>
                )}
              </Box>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                Selecionar “Publicar” abre o editor com esta produção pré-selecionada, removível. Não cria um post de acompanhamento.
              </Typography>
            </Box>
          </Box>
        </Box>

        {(siblings.length > 0 || unknownRelated.length > 0) && (
          <Box component="section" aria-labelledby="relacionadas-heading" data-testid="related" sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Typography id="relacionadas-heading" component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
              Histórias relacionadas
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Mesma franquia e relações da fonte (continuações, derivados…).</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 3 }}>
              {siblings.map((s) => (
                <RelatedWorkCard
                  key={s.anilistId}
                  anilistId={s.anilistId}
                  coverImage={s.coverImage}
                  titleNative={s.titleNative}
                  titleRomaji={s.titleRomaji}
                  titleEnglish={s.titleEnglish}
                  nextAiringAt={nextBySibling.get(s.anilistId)?.toISOString() ?? null}
                  note={`Temporada ${s.seasonNumber}${s.format ? ` · ${FORMAT_LABEL[s.format] ?? s.format}` : ""}`}
                />
              ))}
              {unknownRelated.map((r) => (
                <RelatedWorkCard
                  key={r.id}
                  anilistId={r.id}
                  coverImage={null}
                  titleNative={null}
                  titleRomaji={r.titleRomaji}
                  titleEnglish={null}
                  nextAiringAt={null}
                  note={`${RELATION_LABEL[r.relationType] ?? r.relationType}${r.format ? ` · ${FORMAT_LABEL[r.format] ?? r.format}` : ""}`}
                />
              ))}
            </Box>
          </Box>
        )}
      </PageContainer>
    </Box>
  );
}

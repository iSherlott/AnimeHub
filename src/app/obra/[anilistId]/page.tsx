import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { Box, Chip, Stack, Typography } from "@mui/material";
import LanguageIcon from "@mui/icons-material/Language";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureProduction, parseRelations } from "@/lib/production";
import { htmlToPlainText } from "@/lib/plainText";
import { Header } from "@/components/Header";
import { AnimeTitle } from "@/components/AnimeTitle";
import { CoverImage, BackdropImage } from "@/components/CoverImage";
import { FollowProductionButton } from "@/components/FollowProductionButton";
import { LocalDateTime } from "@/components/LocalDateTime";
import { UserPostList } from "@/components/UserPostList";
import { PublishAboutButton } from "@/components/PublishAboutButton";

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
  const [nextEpisode, owned, siblings] = await Promise.all([
    prisma.airingScheduleEntry.findFirst({
      where: { anilistId: id, airingAt: { gte: new Date() } },
      orderBy: { airingAt: "asc" },
    }),
    user
      ? prisma.anime.findUnique({
          where: { userId_anilistId: { userId: user.id, anilistId: id } },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.production.findMany({
      where: { franchiseId: production.franchiseId, NOT: { id: production.id } },
      orderBy: [{ seasonNumber: "asc" }, { seasonYear: "asc" }],
      select: { anilistId: true, titleRomaji: true, seasonNumber: true, format: true },
    }),
  ]);

  const genres = production.genres ? production.genres.split(",").filter(Boolean) : [];
  const synopsis = htmlToPlainText(production.description);
  const related = parseRelations(production.relationsJson);
  const knownSiblingIds = new Set(siblings.map((s) => s.anilistId));
  const unknownRelated = related.filter((r) => !knownSiblingIds.has(r.id));

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

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <Box sx={{ position: "relative", height: { xs: 200, sm: 280 }, width: "100%", overflow: "hidden" }}>
        {production.bannerImage ? (
          <BackdropImage src={production.bannerImage} />
        ) : (
          <Box sx={{ height: "100%", width: "100%", bgcolor: "background.paper" }} />
        )}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, #0b0b0d, rgba(11,11,13,0.4), transparent)",
          }}
        />
      </Box>

      <Box
        sx={{ maxWidth: 1100, mx: "auto", px: { xs: 2, sm: 5 }, mt: { xs: -8, sm: -12 }, position: "relative" }}
      >
        <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
          {production.coverImage && (
            <Box
              sx={{
                position: "relative",
                width: { xs: 140, sm: 200 },
                aspectRatio: "2 / 3",
                flexShrink: 0,
                borderRadius: 1.5,
                overflow: "hidden",
              }}
            >
              <CoverImage src={production.coverImage} sizes="200px" />
            </Box>
          )}
          <Stack spacing={1.5} sx={{ minWidth: 0, justifyContent: "flex-end" }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              {production.status && (
                <Chip size="small" label={STATUS_LABEL[production.status] ?? production.status} color="primary" />
              )}
              {production.format && (
                <Chip size="small" variant="outlined" label={FORMAT_LABEL[production.format] ?? production.format} />
              )}
            </Stack>
            <Typography component="h1" variant="h3" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
              <AnimeTitle
                titles={{
                  titleRomaji: production.titleRomaji,
                  titleEnglish: production.titleEnglish,
                  titleNative: production.titleNative,
                }}
              />
            </Typography>
            {production.titleNative && (
              <Typography lang="ja" sx={{ color: "text.secondary" }}>
                {production.titleNative}
              </Typography>
            )}
            <Box>
              <FollowProductionButton anilistId={id} initialAnimeId={owned?.id ?? null} loggedIn={Boolean(user)} />
            </Box>
          </Stack>
        </Stack>

        <Box
          data-testid="next-episode"
          sx={{ mt: 4, p: 2, border: 1, borderColor: "divider", borderRadius: 1.5, maxWidth: 520 }}
        >
          <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1 }}>
            Próximo episódio
          </Typography>
          {nextEpisode ? (
            <Typography sx={{ fontWeight: 700 }}>
              Episódio {nextEpisode.episode} · <LocalDateTime iso={nextEpisode.airingAt.toISOString()} />
            </Typography>
          ) : (
            <Typography sx={{ color: "text.secondary" }}>Sem previsão confirmada.</Typography>
          )}
        </Box>

        <Stack spacing={4} sx={{ mt: 4 }}>
          <Box component="section" aria-labelledby="sinopse-heading">
            <Typography id="sinopse-heading" component="h2" variant="h6" sx={{ mb: 1 }}>
              Sinopse
            </Typography>
            <Typography sx={{ whiteSpace: "pre-wrap", color: "text.secondary", maxWidth: 760 }}>
              {synopsis || "Sem sinopse disponível."}
            </Typography>
          </Box>

          {genres.length > 0 && (
            <Box component="section" aria-labelledby="generos-heading">
              <Typography id="generos-heading" component="h2" variant="h6" sx={{ mb: 1 }}>
                Gêneros
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                {genres.map((g) => (
                  <Chip key={g} size="small" label={g} variant="outlined" />
                ))}
              </Stack>
            </Box>
          )}

          <Box component="section" aria-labelledby="info-heading">
            <Typography id="info-heading" component="h2" variant="h6" sx={{ mb: 1 }}>
              Informações
            </Typography>
            <Box
              component="dl"
              sx={{ display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 3, rowGap: 0.75, m: 0, maxWidth: 520 }}
            >
              {info.map(([label, value]) => (
                <Box key={label} sx={{ display: "contents" }}>
                  <Typography component="dt" variant="body2" sx={{ color: "text.secondary" }}>
                    {label}
                  </Typography>
                  <Typography component="dd" variant="body2" sx={{ m: 0 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
            {production.officialSite && (
              <Box sx={{ mt: 1.5 }}>
                <Chip
                  component="a"
                  clickable
                  href={production.officialSite}
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={<LanguageIcon />}
                  label="Site oficial"
                  data-testid="official-site"
                />
              </Box>
            )}
          </Box>

          <Box component="section" aria-labelledby="discussoes-heading" id="discussoes" data-testid="discussions">
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5, flexWrap: "wrap" }}>
              <Typography id="discussoes-heading" component="h2" variant="h6">
                Discussões sobre esta obra
              </Typography>
              <PublishAboutButton anilistId={id} loggedIn={Boolean(user)} />
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
              Impressões da comunidade. Contexto explícito, spoilers protegidos.
            </Typography>
            <UserPostList
              endpoint="/api/posts"
              params={{ tab: "recent", anilistId: String(id) }}
              emptyText="Esta obra ainda não tem discussões. Seja a primeira pessoa a compartilhar uma impressão."
            />
          </Box>

          {(siblings.length > 0 || unknownRelated.length > 0) && (
            <Box component="section" aria-labelledby="relacionadas-heading" data-testid="related">
              <Typography id="relacionadas-heading" component="h2" variant="h6" sx={{ mb: 1 }}>
                Mesma franquia
              </Typography>
              <Stack component="ul" spacing={0.75} sx={{ listStyle: "none", p: 0, m: 0 }}>
                {siblings.map((s) => (
                  <li key={s.anilistId}>
                    <NextLink href={`/obra/${s.anilistId}`}>{s.titleRomaji}</NextLink>{" "}
                    <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                      · Temporada {s.seasonNumber}
                      {s.format ? ` · ${FORMAT_LABEL[s.format] ?? s.format}` : ""}
                    </Typography>
                  </li>
                ))}
                {unknownRelated.map((r) => (
                  <li key={r.id}>
                    <NextLink href={`/obra/${r.id}`}>{r.titleRomaji}</NextLink>{" "}
                    <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                      · {RELATION_LABEL[r.relationType] ?? r.relationType}
                      {r.format ? ` · ${FORMAT_LABEL[r.format] ?? r.format}` : ""}
                    </Typography>
                  </li>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </Box>
    </div>
  );
}

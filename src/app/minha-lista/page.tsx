import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { LinkButton } from "@/components/LinkButton";
import { MyListView, type MyListEntry } from "@/components/MyListView";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Minha Lista (Figma `8:2608`, D-02 aprovada): privada, agrupada pela data
 * do próximo lançamento. Sem status de consumo, contador de episódios,
 * nota ou "Continuar assistindo".
 */
export default async function MinhaListaPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
        <Header />
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            Faça login para ver sua lista
          </Typography>
          <Typography variant="body2" sx={{ maxWidth: 448, color: "text.secondary" }}>
            O feed, Descobrir e o calendário de lançamentos continuam livres
            pra navegar sem conta — só a sua lista pessoal precisa de login.
          </Typography>
          <LinkButton href="/login?next=%2Fminha-lista" variant="contained" sx={{ mt: 1 }}>
            Entrar
          </LinkButton>
        </Box>
      </Box>
    );
  }

  const animes = await prisma.anime.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      anilistId: true,
      titleRomaji: true,
      titleEnglish: true,
      titleNative: true,
      titlePortuguese: true,
      coverImage: true,
      isFavorite: true,
      createdAt: true,
    },
  });

  if (animes.length === 0) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
        <Header />
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            Você ainda não está acompanhando nenhum anime.
          </Typography>
          <Typography variant="body2" sx={{ maxWidth: 448, color: "text.secondary" }}>
            Encontre uma história e acompanhe para ver suas próximas datas aqui.
          </Typography>
          <LinkButton href="/discover" variant="contained" sx={{ mt: 1 }}>
            Explorar animes
          </LinkButton>
        </Box>
      </Box>
    );
  }

  // Próximo episódio com data confirmada de cada obra da lista (um por obra).
  const upcoming = await prisma.airingScheduleEntry.findMany({
    where: { anilistId: { in: animes.map((a) => a.anilistId) }, airingAt: { gte: new Date() } },
    orderBy: { airingAt: "asc" },
    select: { anilistId: true, episode: true, airingAt: true },
  });
  const nextByAnilistId = new Map<number, { episode: number; airingAt: Date }>();
  for (const entry of upcoming) {
    if (!nextByAnilistId.has(entry.anilistId)) nextByAnilistId.set(entry.anilistId, entry);
  }

  const entries: MyListEntry[] = animes.map((a) => {
    const next = nextByAnilistId.get(a.anilistId);
    return {
      id: a.id,
      anilistId: a.anilistId,
      titleRomaji: a.titleRomaji,
      titleEnglish: a.titleEnglish,
      titleNative: a.titleNative,
      titlePortuguese: a.titlePortuguese,
      coverImage: a.coverImage,
      isFavorite: a.isFavorite,
      createdAt: a.createdAt.toISOString(),
      nextAiringAt: next ? next.airingAt.toISOString() : null,
      nextEpisode: next ? next.episode : null,
    };
  });

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />
      <Box sx={{ px: { xs: 3, sm: 5 }, pt: 4 }}>
        <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
          Minha Lista
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }} data-testid="list-count">
          {entries.length} {entries.length === 1 ? "anime acompanhando" : "animes acompanhando"} · só você vê esta lista
        </Typography>
      </Box>
      <MyListView entries={entries} />
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { AdminPageHeader, StatCard, StatGrid } from "@/components/admin/AdminUi";
import { AdminCastThemesPanel } from "@/components/admin/AdminCastThemesPanel";
import { requireAdminPage } from "@/lib/adminPage";
import { currentSeasonRef } from "@/lib/exploreGroups";

export const dynamic = "force-dynamic";

/** Admin → Elenco e aberturas (10/11/2026): carrega personagens/dubladores (AniList) e músicas (AnimeThemes) por temporada. */
export default async function AdminCastThemesPage() {
  await requireAdminPage("catalog");
  const [characters, actors, worksWithCast, themes, worksWithThemes] = await Promise.all([
    prisma.character.count(),
    prisma.voiceActor.count(),
    prisma.workCharacter.groupBy({ by: ["anilistId"] }).then((r) => r.length),
    prisma.workTheme.count(),
    prisma.workTheme.groupBy({ by: ["anilistId"] }).then((r) => r.length),
  ]);
  const season = currentSeasonRef();
  return (
    <>
      <AdminPageHeader title="Elenco e aberturas" subtitle="Personagens, dubladores e as músicas de abertura e encerramento das obras da plataforma." />
      <StatGrid>
        <StatCard testId="cast-characters" label="Personagens" value={characters.toLocaleString("pt-BR")} hint={`${worksWithCast} obras com elenco`} />
        <StatCard testId="cast-actors" label="Dubladores" value={actors.toLocaleString("pt-BR")} />
        <StatCard testId="cast-themes" label="Aberturas e encerramentos" value={themes.toLocaleString("pt-BR")} hint={`${worksWithThemes} obras com músicas`} />
      </StatGrid>
      <AdminCastThemesPanel defaultSeason={{ season: season.season, year: season.year }} />
    </>
  );
}

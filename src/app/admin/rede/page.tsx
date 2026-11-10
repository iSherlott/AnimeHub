import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/admin/AdminUi";
import { AdminSocialPanels } from "@/components/admin/AdminSocialPanels";
import { requireAdminPage } from "@/lib/adminPage";
import { currentSeasonRef } from "@/lib/exploreGroups";

export const dynamic = "force-dynamic";

/** Admin → Eventos e votações (10/11/2026): agenda de eventos, anime da semana e bolão da temporada. */
export default async function AdminSocialPage() {
  await requireAdminPage("admin");
  // Os eventos da última semana em diante (os mais antigos já passaram).
  const since = new Date(new Date().getTime() - 7 * 24 * 3600 * 1000);
  const [events, vote, pool] = await Promise.all([
    prisma.animeEvent.findMany({ where: { deletedAt: null, startsAt: { gte: since } }, orderBy: { startsAt: "asc" }, take: 50, include: { _count: { select: { rsvps: true } } } }),
    prisma.weeklyVote.findFirst({ orderBy: { createdAt: "desc" }, include: { _count: { select: { options: true, ballots: true } } } }),
    prisma.seasonPool.findFirst({ orderBy: { createdAt: "desc" }, include: { _count: { select: { picks: true } } } }),
  ]);
  const season = currentSeasonRef();
  return (
    <>
      <AdminPageHeader title="Eventos e votações" subtitle="Os disparos da parte social: a agenda de eventos (e parcerias), o anime da semana e o bolão da temporada." />
      <AdminSocialPanels
        events={events.map((e) => ({ id: e.id, title: e.title, kind: e.kind, startsAt: e.startsAt.toISOString(), place: e.place, partner: e.partner, going: e._count.rsvps }))}
        vote={vote ? { id: vote.id, title: vote.title, status: vote.status, closesAt: vote.closesAt.toISOString(), options: vote._count.options, ballots: vote._count.ballots } : null}
        pool={pool ? { id: pool.id, title: pool.title, status: pool.status, closesAt: pool.closesAt.toISOString(), picks: pool._count.picks } : null}
        defaultSeason={{ season: season.season, year: season.year }}
      />
    </>
  );
}

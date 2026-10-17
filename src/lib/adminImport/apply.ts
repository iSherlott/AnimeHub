import type { AdminJob, ImportRecord } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseSeasonSlug, type SeasonRef } from "@/lib/exploreGroups";
import { ensureProduction, mergeStreamingLinks, parseStreamingLinks } from "@/lib/production";
import { defaultImportDeps, loadAiring } from "@/lib/anilistImport";
import { hasBlockedGenre } from "@/lib/contentPolicy";
import { backfillEarlierSeasons, syncContinuations } from "@/lib/continuation";
import { relinkAnidbOnlyEntries } from "./relink";

/**
 * Aplica ao catálogo o que o lote do AniDB decidiu (commit) — e pode ser REAPLICADO com segurança: tudo aqui é
 * idempotente. Para cada registro:
 *  - casado com a AniList (AUTO/CONFIRMED): a obra entra na plataforma (`onPlatform`) ANTES de qualquer outra coisa,
 *    ganha a produção (se a AniList responder) com o vínculo e os sites do AniDB, e seus episódios vão para o calendário;
 *  - novo (NEW): vira uma entrada do catálogo com imagem inteira, gêneros das tags, situação coerente com a data.
 * Nada é gravado para conteúdo adulto.
 */
export type ApplySummary = {
  /** Obras casadas que entraram na plataforma. */
  linked: number;
  /** Entradas novas criadas só com os dados do AniDB. */
  created: number;
  /** Entradas do AniDB que já existiam e foram atualizadas (imagem, gêneros, situação). */
  updated: number;
  /** Casadas cuja produção a AniList não devolveu agora (a página da obra é criada quando alguém a abre). */
  deferred: number;
  /** Episódios gravados no calendário. */
  episodes: number;
  /** Registros recusados por conteúdo adulto. */
  adult: number;
  alerts: number;
  /** Temporadas anteriores acrescentadas, como "terminei", à lista de quem já acompanha uma temporada mais nova. */
  earlierSeasons: number;
  /** Obras que só tinham o AniDB (sem página) e passaram a ser a obra da AniList. */
  relinked: number;
};

export const EMPTY_SUMMARY: ApplySummary = { linked: 0, created: 0, updated: 0, deferred: 0, episodes: 0, adult: 0, alerts: 0, earlierSeasons: 0, relinked: 0 };

const WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * Situação de uma obra que só temos pelo AniDB: nunca "NOT_YET_RELEASED" para o que já estreou. Filme/episódio único já
 * exibido está finalizado; série cujo total de episódios já cabe nas semanas desde a estreia também.
 */
export function inferStatus(rec: { format: string | null; episodes: number | null; airsAt: Date | null }, now: Date = new Date()): string {
  if (!rec.airsAt || rec.airsAt.getTime() > now.getTime()) return "NOT_YET_RELEASED";
  if (rec.format === "MOVIE" || rec.episodes === 1) return "FINISHED";
  if (rec.episodes !== null && rec.airsAt.getTime() + rec.episodes * WEEK_MS < now.getTime()) return "FINISHED";
  return "RELEASING";
}

type Job = AdminJob & { records: ImportRecord[] };

function seasonOf(job: Job): SeasonRef | null {
  return job.season ? parseSeasonSlug(job.season.toLowerCase()) : null;
}

async function applyMatched(rec: ImportRecord, summary: ApplySummary, warn: (message: string) => Promise<void>): Promise<void> {
  const anilistId = rec.matchedAnilistId as number;
  // 1) Entra na plataforma primeiro: sem isso a produção (que só nasce para obra da plataforma) nunca seria criada.
  await prisma.catalogEntry.updateMany({ where: { anilistId }, data: { onPlatform: true } });

  const existing = await prisma.production.findUnique({ where: { anilistId } });
  const production = existing ?? (await ensureProduction(anilistId).catch(() => null));
  if (!production) {
    summary.deferred += 1;
    await warn(`${rec.titleRomaji} (AniList #${anilistId}) entrou na plataforma, mas a produção ainda não foi criada: nasce quando a obra for aberta.`);
    return;
  }
  if (hasBlockedGenre(production.genres)) {
    summary.adult += 1;
    await prisma.catalogEntry.updateMany({ where: { anilistId }, data: { onPlatform: false } });
    return;
  }
  const anidbId = Number(rec.sourceKey);
  const links = mergeStreamingLinks(parseStreamingLinks(production.streamingLinksJson), parseStreamingLinks(rec.linksJson));
  try {
    await prisma.production.update({
      where: { id: production.id },
      data: {
        anidbId,
        streamingLinksJson: links.length || production.streamingLinksJson !== null ? JSON.stringify(links) : undefined,
        description: production.description ? undefined : rec.description,
        episodes: production.episodes ?? rec.episodes ?? undefined,
      },
    });
    summary.linked += 1;
  } catch {
    // O AniDB só pode estar ligado a UMA produção. Se quem o tem é de outro ano que esta obra, o vínculo veio de um lote
    // com o ano errado: o novo (certo) toma o lugar dele; se for do mesmo ano, é conflito de verdade e fica como está.
    const holder = await prisma.production.findUnique({ where: { anidbId }, select: { id: true, seasonYear: true, titleRomaji: true } });
    const movable = holder && holder.id !== production.id && holder.seasonYear !== null && production.seasonYear !== null && Math.abs(holder.seasonYear - production.seasonYear) >= 1;
    if (!holder || !movable) {
      await warn(`AniDB #${anidbId} já está vinculado a outra produção.`);
      return;
    }
    try {
      await prisma.$transaction([
        prisma.production.update({ where: { id: holder.id }, data: { anidbId: null } }),
        prisma.production.update({ where: { id: production.id }, data: { anidbId, streamingLinksJson: links.length || production.streamingLinksJson !== null ? JSON.stringify(links) : undefined, description: production.description ? undefined : rec.description, episodes: production.episodes ?? rec.episodes ?? undefined } }),
      ]);
      summary.linked += 1;
      await warn(`AniDB #${anidbId} saiu de “${holder.titleRomaji}” (outro ano) e foi vinculado a “${production.titleRomaji}”.`);
    } catch {
      await warn(`AniDB #${anidbId} já está vinculado a outra produção.`);
    }
  }
}

async function applyNew(rec: ImportRecord, job: Job, summary: ApplySummary, now: Date): Promise<void> {
  const anidbId = Number(rec.sourceKey);
  const season = seasonOf(job);
  const data = {
    titleRomaji: rec.titleRomaji,
    titleNative: rec.titleNative,
    titleEnglish: rec.titleEnglish,
    coverImage: rec.imageUrl,
    description: rec.description,
    episodes: rec.episodes,
    genres: rec.genres,
    season: season?.season ?? null,
    seasonYear: rec.year ?? season?.year ?? null,
    status: inferStatus(rec, now),
    startDate: rec.airsAt,
  };
  const existing = await prisma.catalogEntry.findUnique({ where: { anidbId } });
  if (!existing) {
    await prisma.catalogEntry.create({ data: { anidbId, ...data, source: "anidb", onPlatform: true } });
    summary.created += 1;
    return;
  }
  // Já existe: só a entrada que é do AniDB (sem AniList) é nossa para ajustar; as demais ficam como estão.
  if (existing.source !== "anidb") return;
  await prisma.catalogEntry.update({
    where: { id: existing.id },
    data: { ...data, genres: rec.genres ?? existing.genres, coverImage: rec.imageUrl ?? existing.coverImage, onPlatform: true },
  });
  summary.updated += 1;
}

/** Aplica os registros do lote e carrega no calendário os episódios das obras casadas. Nunca lança por causa da AniList. */
export async function applyRecords(
  job: Job,
  warn: (message: string) => Promise<void>,
  now: Date = new Date(),
  onProgress: (done: number, total: number, note: string) => Promise<void> = async () => undefined
): Promise<ApplySummary> {
  const summary: ApplySummary = { ...EMPTY_SUMMARY };
  const matchedIds: number[] = [];
  const total = job.records.length;
  let done = 0;
  for (const rec of job.records) {
    if (done % 3 === 0) await onProgress(done, total, `Aplicando ao catálogo: ${done} de ${total}`);
    done += 1;
    if (rec.state === "IGNORED") {
      // Adulto: tira do catálogo o que uma aplicação anterior tenha criado.
      if (rec.note?.toLowerCase().includes("adulto")) {
        summary.adult += 1;
        await prisma.catalogEntry.deleteMany({ where: { anidbId: Number(rec.sourceKey), source: "anidb" } });
      }
      continue;
    }
    if ((rec.state === "AUTO" || rec.state === "CONFIRMED") && rec.matchedAnilistId !== null) {
      await applyMatched(rec, summary, warn);
      matchedIds.push(rec.matchedAnilistId);
    } else if (rec.state === "NEW") {
      await applyNew(rec, job, summary, now);
    }
  }
  if (matchedIds.length > 0) {
    await onProgress(total, total, `Carregando os episódios de ${new Set(matchedIds).size} obras no calendário…`);
    try {
      summary.episodes = await loadAiring(Array.from(new Set(matchedIds)), defaultImportDeps);
    } catch (error) {
      console.error("[admin-import] episódios não puderam ser carregados:", error);
      await warn("Os episódios do calendário não puderam ser carregados agora; use Reaplicar vínculos para tentar de novo.");
    }
  }
  // Obra que só ficou com o AniDB (sem página) mas que o catálogo já conhece — título escrito de outro jeito ou AniList ainda sem
  // cache quando o lote foi analisado — passa a ser a obra da AniList. Só olha o banco; a busca ao vivo é do painel do admin.
  try {
    const relinked = await relinkAnidbOnlyEntries();
    summary.relinked = relinked.linked.length;
  } catch (error) {
    console.error("[admin-import] revincular obras do AniDB falhou:", error);
  }
  // Continuações e obras que voltaram a sair episódios: voltam à lista/calendário de quem acompanhava a anterior.
  await syncContinuations(now);
  // Carga de obras ANTIGAS: quem já acompanha uma temporada mais nova (em qualquer situação: terminada, dropada ou no ar)
  // recebe as anteriores recém-chegadas como "terminei". Não depende de haver episódio por vir, e vale para carga nova também.
  summary.earlierSeasons = await backfillEarlierSeasons();
  return summary;
}

export function describeSummary(summary: ApplySummary): string {
  const parts = [
    `${summary.linked} ${summary.linked === 1 ? "obra casada na plataforma" : "obras casadas na plataforma"}`,
    `${summary.created} ${summary.created === 1 ? "nova" : "novas"}`,
    summary.updated > 0 ? `${summary.updated} atualizada(s)` : null,
    `${summary.episodes} ${summary.episodes === 1 ? "episódio" : "episódios"} no calendário`,
    summary.deferred > 0 ? `${summary.deferred} com produção a criar ao abrir` : null,
    summary.relinked > 0 ? `${summary.relinked} ${summary.relinked === 1 ? "obra só do AniDB ligada à AniList" : "obras só do AniDB ligadas à AniList"}` : null,
    summary.earlierSeasons > 0 ? `${summary.earlierSeasons} ${summary.earlierSeasons === 1 ? "temporada anterior adicionada" : "temporadas anteriores adicionadas"} a quem acompanha as seguintes` : null,
    summary.adult > 0 ? `${summary.adult} recusada(s) por conteúdo adulto` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

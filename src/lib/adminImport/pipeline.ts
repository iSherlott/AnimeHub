import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseSeasonSlug, seasonLabel, type SeasonRef } from "@/lib/exploreGroups";
import { recordRescheduleAlerts, RESCHEDULE_THRESHOLD_MS } from "@/lib/rescheduleAlerts";
import { AUTO_THRESHOLD, classifyMatch, rankCandidates, scoreCandidate, type MatchCandidate, type ScoreDetail } from "@/lib/adminImport/matching";
import { MAX_HTML_BYTES, PARSER_VERSION, parseSeasonHtml } from "@/lib/adminImport/parseSeasonHtml";
import { ensureProduction, mergeStreamingLinks, parseStreamingLinks } from "@/lib/production";
import { prefetchSeasonCache } from "@/lib/seasonalCatalog";
import type { JobStage, JobState } from "@/lib/adminImport/jobSteps";

/**
 * Pipeline de importação revisada (Admin → Importações → Matching → Conflitos
 * → commit). Nada vai para o catálogo antes da confirmação explícita: a análise
 * só grava a PRÉVIA (job + registros + conflitos); o commit é um passo à parte.
 */
export type AdminActor = { id: string; name: string };

export const SOURCES = ["AniDB"] as const;

type LogInput = {
  jobSeq?: number | null;
  source?: string | null;
  level?: "INFO" | "WARN" | "ERROR";
  event: string;
  message: string;
  context?: string | null;
  actor?: AdminActor | null;
};

export async function logEvent(entry: LogInput): Promise<void> {
  try {
    await prisma.adminLog.create({
      data: {
        jobSeq: entry.jobSeq ?? null,
        source: entry.source ?? null,
        level: entry.level ?? "INFO",
        event: entry.event,
        message: entry.message,
        context: entry.context ?? null,
        adminName: entry.actor?.name ?? null,
      },
    });
  } catch (error) {
    // Auditoria nunca derruba a operação principal.
    console.error("[admin-log] falhou:", error);
  }
}

/** Candidatos que ainda não têm página própria (só estão no catálogo da temporada) usam `ce:<anilistId>` no lugar do id de Production. */
export const CATALOG_CANDIDATE_PREFIX = "ce:";

type CandidateSource = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  season: string | null;
  seasonYear: number | null;
  anidbId: number | null;
};

function toCandidate(id: string, p: CandidateSource): MatchCandidate {
  return {
    id,
    anilistId: p.anilistId,
    titles: [p.titleRomaji, p.titleNative, p.titleEnglish].filter((t): t is string => Boolean(t)),
    season: p.season,
    seasonYear: p.seasonYear,
    anidbId: p.anidbId,
  };
}

/**
 * Tudo que uma linha do AniDB pode ser: as produções já abertas E o catálogo da
 * temporada vindo da AniList (obras que ninguém abriu ainda). Antes de montar o
 * conjunto, completa o catálogo da temporada — sem isso, obras que a Explorar
 * nunca carregou viravam "novas" e duplicavam o que a AniList já tem.
 */
export async function loadCandidatePool(season: SeasonRef): Promise<{ candidates: MatchCandidate[]; blocked: MatchCandidate[] }> {
  // A AniList só entra no CACHE (fora da plataforma) para dar com o que casar; o que é hentai volta como "bloqueado".
  let blocked: MatchCandidate[] = [];
  if (process.env.IMPORT_PREFETCH_SEASON !== "false") {
    try {
      const prefetched = await prefetchSeasonCache(season.season, season.year);
      blocked = prefetched.blocked.map((m) => ({
        id: `blocked:${m.id}`,
        anilistId: m.id,
        titles: [m.title.romaji, m.title.native, m.title.english].filter((t): t is string => Boolean(t)),
        season: m.season,
        seasonYear: m.seasonYear,
        anidbId: null,
      }));
    } catch (error) {
      console.error("[admin-import] não foi possível completar o catálogo da temporada:", error);
    }
  }
  const [productions, entries] = await Promise.all([
    prisma.production.findMany({ select: { id: true, anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, season: true, seasonYear: true, anidbId: true } }),
    prisma.catalogEntry.findMany({
      where: { anilistId: { not: null } },
      select: { anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, season: true, seasonYear: true, anidbId: true },
    }),
  ]);
  const known = new Set(productions.map((p) => p.anilistId));
  const candidates = [
    ...productions.map((p) => toCandidate(p.id, p)),
    ...entries
      .filter((e): e is typeof e & { anilistId: number } => e.anilistId !== null && !known.has(e.anilistId))
      .map((e) => toCandidate(`${CATALOG_CANDIDATE_PREFIX}${e.anilistId}`, e)),
  ];
  return { candidates, blocked };
}

/** Candidato por id (Production.id ou `ce:<anilistId>`), já no formato do motor de score. */
export async function loadCandidate(id: string): Promise<MatchCandidate | null> {
  if (id.startsWith(CATALOG_CANDIDATE_PREFIX)) {
    const anilistId = Number(id.slice(CATALOG_CANDIDATE_PREFIX.length));
    if (!Number.isInteger(anilistId)) return null;
    const entry = await prisma.catalogEntry.findUnique({ where: { anilistId } });
    return entry && entry.anilistId !== null ? toCandidate(id, { ...entry, anilistId: entry.anilistId }) : null;
  }
  const production = await prisma.production.findUnique({ where: { id } });
  return production ? toCandidate(production.id, production) : null;
}

export type AnalyzeResult =
  | { ok: true; seq: number }
  | { ok: false; error: string; field?: "html" | "season" | "source"; seq?: number };

export async function analyzeImport(input: { html: string; source: string; season: string; actor: AdminActor }): Promise<AnalyzeResult> {
  const source = input.source.trim();
  if (!(SOURCES as readonly string[]).includes(source)) return { ok: false, field: "source", error: "Escolha uma fonte válida." };
  const seasonRef = parseSeasonSlug(input.season.trim().toLowerCase());
  if (!seasonRef) return { ok: false, field: "season", error: "Escolha a temporada do lote." };
  if (!input.html.trim()) return { ok: false, field: "html", error: "Cole o HTML da temporada para analisar." };
  const bytes = Buffer.byteLength(input.html, "utf8");
  if (bytes > MAX_HTML_BYTES) {
    return { ok: false, field: "html", error: `O HTML tem ${Math.ceil(bytes / 1024)} KB; o limite é ${Math.floor(MAX_HTML_BYTES / 1024)} KB.` };
  }

  const label = seasonLabel(seasonRef);
  const job = await prisma.adminJob.create({
    data: {
      kind: "IMPORT",
      source,
      season: label,
      state: "RUNNING",
      stage: "PARSE",
      parserVersion: PARSER_VERSION,
      htmlBytes: bytes,
      html: input.html,
      adminId: input.actor.id,
      adminName: input.actor.name,
    },
  });
  const ctx = `Job #${job.seq} · ${source} · parser ${PARSER_VERSION}`;
  await logEvent({ jobSeq: job.seq, source, event: "Import started", message: "Importação do HTML iniciada.", context: ctx, actor: input.actor });

  try {
    const parsed = parseSeasonHtml(input.html, { season: seasonRef });
    if (parsed.records.length === 0) {
      const error = "Nenhum registro encontrado no HTML. Confira se a listagem de temporada foi colada por inteiro.";
      await prisma.adminJob.update({ where: { seq: job.seq }, data: { state: "FAILED", stage: "PARSE", error, finishedAt: new Date() } });
      await logEvent({ jobSeq: job.seq, source, level: "ERROR", event: "Parse failed", message: error, context: ctx, actor: input.actor });
      return { ok: false, field: "html", error, seq: job.seq };
    }

    const { candidates, blocked: blockedPool } = await loadCandidatePool(seasonRef);

    const now = new Date();
    const recordRows: Prisma.ImportRecordCreateManyInput[] = [];
    const conflictRows: Prisma.CatalogConflictCreateManyInput[] = [];
    let auto = 0;
    let created = 0;
    let pending = 0;
    let adult = 0;

    for (const rec of parsed.records) {
      const titles = [rec.titleRomaji, rec.titleNative, rec.titleEnglish].filter((t): t is string => Boolean(t));
      const matchInput = { sourceKey: rec.sourceKey, titles, seasonLabel: label, year: rec.year };
      // Conteúdo adulto (hentai) não entra na plataforma: o registro já nasce ignorado, com o motivo.
      const adultMatch = rankCandidates(matchInput, blockedPool, 1)[0];
      if (adultMatch && adultMatch.score >= AUTO_THRESHOLD) {
        adult += 1;
        recordRows.push({
          jobSeq: job.seq,
          sourceKey: rec.sourceKey,
          titleRomaji: rec.titleRomaji,
          titleNative: rec.titleNative,
          titleEnglish: rec.titleEnglish,
          seasonLabel: label,
          year: rec.year,
          format: rec.format,
          airsAt: rec.airsAt,
          airsAtHasTime: rec.airsAtHasTime,
          description: rec.description,
          episodes: rec.episodes,
          imageUrl: rec.imageUrl,
          linksJson: null,
          capturedAt: now,
          state: "IGNORED",
          note: "Conteúdo adulto (hentai): fora da plataforma.",
        });
        continue;
      }
      const ranked = rankCandidates(matchInput, candidates);
      const outcome = classifyMatch(ranked);
      if (outcome.state === "AUTO") auto += 1;
      else if (outcome.state === "NEW") created += 1;
      else pending += 1;

      recordRows.push({
        jobSeq: job.seq,
        sourceKey: rec.sourceKey,
        titleRomaji: rec.titleRomaji,
        titleNative: rec.titleNative,
        titleEnglish: rec.titleEnglish,
        seasonLabel: label,
        year: rec.year,
        format: rec.format,
        airsAt: rec.airsAt,
        airsAtHasTime: rec.airsAtHasTime,
        description: rec.description,
        episodes: rec.episodes,
        imageUrl: rec.imageUrl,
        linksJson: rec.links.length ? JSON.stringify(rec.links) : null,
        capturedAt: now,
        matchedProductionId: outcome.best?.candidate.id ?? null,
        matchedAnilistId: outcome.best?.candidate.anilistId ?? null,
        score: outcome.best?.score ?? null,
        scoreDetail: outcome.best ? JSON.stringify(outcome.best.detail) : null,
        state: outcome.state,
      });

      // Divergência de horário: só quando a fonte informou data E hora e existe um episódio próximo no cache.
      if (outcome.best && rec.airsAt && rec.airsAtHasTime) {
        const anilistId = outcome.best.candidate.anilistId;
        const near = await prisma.airingScheduleEntry.findMany({
          where: { anilistId, airingAt: { gte: new Date(rec.airsAt.getTime() - 3 * 86400_000), lte: new Date(rec.airsAt.getTime() + 3 * 86400_000) } },
          orderBy: { airingAt: "asc" },
        });
        const entry = near.sort((a, b) => Math.abs(a.airingAt.getTime() - rec.airsAt!.getTime()) - Math.abs(b.airingAt.getTime() - rec.airsAt!.getTime()))[0];
        if (entry && Math.abs(entry.airingAt.getTime() - rec.airsAt.getTime()) > RESCHEDULE_THRESHOLD_MS) {
          const [overridden, openConflict] = await Promise.all([
            prisma.catalogOverride.findFirst({ where: { anilistId, episode: entry.episode, removedAt: null } }),
            prisma.catalogConflict.findFirst({ where: { anilistId, episode: entry.episode, status: "PENDING" } }),
          ]);
          if (!overridden && !openConflict) {
            conflictRows.push({
              jobSeq: job.seq,
              anilistId,
              episode: entry.episode,
              field: "airingAt",
              titleSnapshot: rec.titleNative ?? rec.titleRomaji,
              aValue: entry.airingAt,
              aSource: "AniList",
              bValue: rec.airsAt,
              bSource: source,
              bMeta: JSON.stringify({ sourceKey: rec.sourceKey, parserVersion: PARSER_VERSION, capturedAt: now.toISOString() }),
            });
          }
        }
      }
    }

    await prisma.importRecord.createMany({ data: recordRows });
    if (conflictRows.length) await prisma.catalogConflict.createMany({ data: conflictRows });

    const blocked = pending + conflictRows.length;
    await prisma.adminJob.update({
      where: { seq: job.seq },
      data: { total: parsed.records.length, processed: parsed.records.length - pending, stage: blocked > 0 ? "MATCHING" : "COMMIT" },
    });
    await logEvent({ jobSeq: job.seq, source, event: `${parsed.records.length} parsed`, message: `${parsed.records.length} registros extraídos e normalizados.`, context: `Job #${job.seq} · ${label}`, actor: input.actor });
    await logEvent({ jobSeq: job.seq, source, event: `${auto} matches detected`, message: `${auto} correspondências automáticas detectadas.`, context: `Job #${job.seq} · ${created} novos + ${pending} revisão`, actor: input.actor });
    if (adult > 0) {
      await logEvent({ jobSeq: job.seq, source, level: "WARN", event: `${adult} adult titles ignored`, message: `${adult} registro(s) de conteúdo adulto foram ignorados automaticamente.`, context: `Job #${job.seq} · política de conteúdo`, actor: input.actor });
    }
    if (conflictRows.length) {
      await logEvent({ jobSeq: job.seq, source, event: `${conflictRows.length} conflicts`, message: `${conflictRows.length} conflitos registrados para revisão antes de confirmar.`, context: `Job #${job.seq} · decisões auditadas`, actor: input.actor });
    }
    for (const warning of parsed.warnings.slice(0, 10)) {
      await logEvent({ jobSeq: job.seq, source, level: "WARN", event: "Parse warning", message: warning, context: ctx, actor: input.actor });
    }
    return { ok: true, seq: job.seq };
  } catch (error) {
    console.error("[admin-import] falhou:", error);
    const message = "Falha ao processar importação. Nenhum registro foi salvo no catálogo.";
    await prisma.adminJob.update({ where: { seq: job.seq }, data: { state: "FAILED", error: message, finishedAt: new Date() } }).catch(() => undefined);
    await logEvent({ jobSeq: job.seq, source, level: "ERROR", event: "Import failed", message, context: ctx, actor: input.actor });
    return { ok: false, error: message, seq: job.seq };
  }
}

export type JobCounts = {
  total: number;
  auto: number;
  created: number;
  pendingRecords: number;
  confirmed: number;
  ignored: number;
  conflictsPending: number;
  conflictsResolved: number;
  /** Tudo que bloqueia o commit. */
  blocking: number;
  /** Registros já decididos (aceitos, novos, confirmados ou ignorados). */
  resolved: number;
};

export async function jobCounts(seq: number): Promise<JobCounts> {
  const [records, conflicts] = await Promise.all([
    prisma.importRecord.groupBy({ by: ["state"], where: { jobSeq: seq }, _count: { _all: true } }),
    prisma.catalogConflict.groupBy({ by: ["status"], where: { jobSeq: seq }, _count: { _all: true } }),
  ]);
  const r = (state: string) => records.find((x) => x.state === state)?._count._all ?? 0;
  const c = (status: string) => conflicts.find((x) => x.status === status)?._count._all ?? 0;
  const total = records.reduce((n, x) => n + x._count._all, 0);
  const pendingRecords = r("PENDING");
  const conflictsPending = c("PENDING");
  return {
    total,
    auto: r("AUTO"),
    created: r("NEW"),
    pendingRecords,
    confirmed: r("CONFIRMED"),
    ignored: r("IGNORED"),
    conflictsPending,
    conflictsResolved: c("RESOLVED"),
    blocking: pendingRecords + conflictsPending,
    resolved: total - pendingRecords,
  };
}

/** Recalcula progresso/etapa depois de qualquer decisão. */
async function refreshProgress(seq: number): Promise<JobCounts> {
  const counts = await jobCounts(seq);
  const job = await prisma.adminJob.findUnique({ where: { seq }, select: { state: true } });
  if (job?.state === "RUNNING") {
    await prisma.adminJob.update({ where: { seq }, data: { processed: counts.resolved, stage: counts.blocking > 0 ? "MATCHING" : "COMMIT" } });
  }
  return counts;
}

type ActionResult = { ok: true } | { ok: false; status: number; error: string };

async function openJobForRecord(recordId: string) {
  const record = await prisma.importRecord.findUnique({ where: { id: recordId }, include: { job: { select: { seq: true, state: true, source: true, season: true } } } });
  if (!record) return { error: { ok: false as const, status: 404, error: "Registro não encontrado." } };
  if (record.job.state !== "RUNNING") return { error: { ok: false as const, status: 409, error: "Esta importação já foi concluída ou cancelada." } };
  return { record };
}

export type RecordAction = { action: "confirm" } | { action: "ignore"; reason?: string } | { action: "new" } | { action: "candidate"; productionId: string };

export async function resolveRecord(recordId: string, input: RecordAction, actor: AdminActor): Promise<ActionResult> {
  const found = await openJobForRecord(recordId);
  if (found.error) return found.error;
  const { record } = found;
  const ctx = `Job #${record.jobSeq} · AniDB #${record.sourceKey}`;
  const decided = { decidedByName: actor.name, decidedAt: new Date() };

  if (input.action === "confirm") {
    if (!record.matchedProductionId) return { ok: false, status: 422, error: "Escolha um candidato antes de confirmar." };
    await prisma.importRecord.update({ where: { id: record.id }, data: { state: "CONFIRMED", ...decided } });
    await logEvent({ jobSeq: record.jobSeq, source: record.job.source, event: "Match confirmed", message: `${record.titleRomaji} confirmado como produção #${record.matchedAnilistId}.`, context: ctx, actor });
  } else if (input.action === "ignore") {
    await prisma.importRecord.update({ where: { id: record.id }, data: { state: "IGNORED", note: input.reason?.trim().slice(0, 300) || null, ...decided } });
    await logEvent({ jobSeq: record.jobSeq, source: record.job.source, event: "Record ignored", message: `${record.titleRomaji} excluído do commit.`, context: ctx, actor });
  } else if (input.action === "new") {
    await prisma.importRecord.update({ where: { id: record.id }, data: { state: "NEW", matchedProductionId: null, matchedAnilistId: null, score: null, scoreDetail: null, ...decided } });
    await logEvent({ jobSeq: record.jobSeq, source: record.job.source, event: "Marked as new", message: `${record.titleRomaji} será criado como produção nova.`, context: ctx, actor });
  } else {
    const candidate = await loadCandidate(input.productionId);
    if (!candidate) return { ok: false, status: 404, error: "Candidato não encontrado no catálogo." };
    const scored = scoreCandidate(
      {
        sourceKey: record.sourceKey,
        titles: [record.titleRomaji, record.titleNative, record.titleEnglish].filter((t): t is string => Boolean(t)),
        seasonLabel: record.seasonLabel,
        year: record.year,
      },
      candidate
    );
    await prisma.importRecord.update({
      where: { id: record.id },
      data: { state: "PENDING", matchedProductionId: candidate.id, matchedAnilistId: candidate.anilistId, score: scored.score, scoreDetail: JSON.stringify(scored.detail), decidedByName: null, decidedAt: null },
    });
    await logEvent({ jobSeq: record.jobSeq, source: record.job.source, event: "Candidate changed", message: `${record.titleRomaji} agora aponta para a produção #${candidate.anilistId}.`, context: ctx, actor });
  }
  await refreshProgress(record.jobSeq);
  return { ok: true };
}

export type ConflictResolution = { resolution: "A" } | { resolution: "B"; reason?: string } | { resolution: "MANUAL"; value: Date; reason: string };

export async function resolveConflict(conflictId: string, input: ConflictResolution, actor: AdminActor): Promise<ActionResult> {
  const conflict = await prisma.catalogConflict.findUnique({ where: { id: conflictId }, include: { job: { select: { state: true } } } });
  if (!conflict) return { ok: false, status: 404, error: "Conflito não encontrado." };
  if (conflict.status !== "PENDING") return { ok: false, status: 409, error: "Este conflito já foi resolvido." };
  if (conflict.job && conflict.job.state !== "RUNNING") return { ok: false, status: 409, error: "A importação deste conflito já foi concluída ou cancelada." };

  let value = conflict.aValue;
  let reason: string | null = null;
  if (input.resolution === "B") {
    value = conflict.bValue;
    reason = input.reason?.trim() || "revisão da origem: fonte B escolhida";
  } else if (input.resolution === "MANUAL") {
    if (Number.isNaN(input.value.getTime())) return { ok: false, status: 422, error: "Informe uma data e um horário válidos." };
    reason = input.reason.trim();
    if (reason.length < 3) return { ok: false, status: 422, error: "Informe o motivo da decisão." };
    value = input.value;
  }

  await prisma.$transaction(async (tx) => {
    if (input.resolution !== "A") {
      // Um único override ativo por episódio: o novo substitui o anterior.
      await tx.catalogOverride.updateMany({
        where: { anilistId: conflict.anilistId, episode: conflict.episode, field: conflict.field, removedAt: null },
        data: { removedAt: new Date(), removedByName: actor.name },
      });
      await tx.catalogOverride.create({
        data: {
          anilistId: conflict.anilistId,
          episode: conflict.episode,
          field: conflict.field,
          titleSnapshot: conflict.titleSnapshot,
          originalValue: conflict.aValue,
          originalSource: conflict.aSource,
          value,
          reason: reason ?? "",
          adminName: actor.name,
        },
      });
    }
    await tx.catalogConflict.update({
      where: { id: conflict.id },
      data: { status: "RESOLVED", resolution: input.resolution, resolvedValue: value, reason, decidedByName: actor.name, decidedAt: new Date() },
    });
  });
  await logEvent({
    jobSeq: conflict.jobSeq,
    source: conflict.bSource,
    event: "Conflict resolved",
    message: `${conflict.titleSnapshot} · EP${conflict.episode}: ${input.resolution === "A" ? "fonte A mantida" : input.resolution === "B" ? "fonte B escolhida" : "valor definido manualmente"}.`,
    context: `Conflito · ${conflict.field} · ${value.toISOString()}`,
    actor,
  });
  if (conflict.jobSeq) await refreshProgress(conflict.jobSeq);
  return { ok: true };
}

export async function commitImport(seq: number, actor: AdminActor): Promise<ActionResult & { summary?: { linked: number; created: number; alerts: number } }> {
  const job = await prisma.adminJob.findUnique({ where: { seq }, include: { records: true, conflicts: true } });
  if (!job) return { ok: false, status: 404, error: "Job não encontrado." };
  if (job.state !== "RUNNING") return { ok: false, status: 409, error: "Esta importação já foi concluída ou cancelada." };
  const pending = job.records.filter((r) => r.state === "PENDING").length + job.conflicts.filter((c) => c.status === "PENDING").length;
  if (pending > 0) return { ok: false, status: 409, error: `Ainda há ${pending} pendência${pending === 1 ? "" : "s"}. Resolva antes de confirmar.` };

  const ctx = `Job #${seq} · ${job.source}`;
  await logEvent({ jobSeq: seq, source: job.source, event: "Commit authorized", message: "Commit autorizado após revisão explícita.", context: ctx, actor });

  const seasonRef: SeasonRef | null = job.season ? parseSeasonSlug(job.season.toLowerCase()) : null;
  let linked = 0;
  let created = 0;
  for (const rec of job.records) {
    const anidbId = Number(rec.sourceKey);
    if ((rec.state === "AUTO" || rec.state === "CONFIRMED") && rec.matchedAnilistId !== null) {
      // Produção existente ou, se a obra só estava no catálogo da temporada, criada agora (só no commit).
      const production = (await prisma.production.findUnique({ where: { anilistId: rec.matchedAnilistId } })) ?? (await ensureProduction(rec.matchedAnilistId));
      if (!production) {
        await logEvent({ jobSeq: seq, source: job.source, level: "WARN", event: "Link skipped", message: `AniList #${rec.matchedAnilistId} não foi encontrada para ${rec.titleRomaji}.`, context: ctx, actor });
        continue;
      }
      // A obra casada passa a fazer parte da plataforma (antes era só cache da AniList).
      await prisma.catalogEntry.updateMany({ where: { anilistId: rec.matchedAnilistId }, data: { onPlatform: true } });
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
        linked += 1;
      } catch {
        await logEvent({ jobSeq: seq, source: job.source, level: "WARN", event: "Link skipped", message: `AniDB #${anidbId} já está vinculado a outra produção.`, context: ctx, actor });
      }
    } else if (rec.state === "NEW") {
      const existing = await prisma.catalogEntry.findUnique({ where: { anidbId } });
      if (!existing) {
        await prisma.catalogEntry.create({
          data: {
            anidbId,
            titleRomaji: rec.titleRomaji,
            titleNative: rec.titleNative,
            titleEnglish: rec.titleEnglish,
            coverImage: rec.imageUrl,
            description: rec.description,
            episodes: rec.episodes,
            season: seasonRef?.season ?? null,
            seasonYear: rec.year ?? seasonRef?.year ?? null,
            status: "NOT_YET_RELEASED",
            startDate: rec.airsAt,
            source: "anidb",
          },
        });
        created += 1;
      }
    }
  }

  // "Data alterada" para quem acompanha: só para decisões que mudaram o horário efetivo.
  let alerts = 0;
  for (const c of job.conflicts) {
    if (c.status === "RESOLVED" && c.resolution !== "A" && c.resolvedValue) {
      alerts += await recordRescheduleAlerts(c.anilistId, c.episode, c.aValue, c.resolvedValue);
    }
  }

  await prisma.adminJob.update({ where: { seq }, data: { state: "SUCCESS", stage: "NOTIFICATION", processed: job.total, finishedAt: new Date(), error: null } });
  await logEvent({ jobSeq: seq, source: job.source, event: "Import completed", message: `Importação concluída: ${linked} vínculos, ${created} produções novas, ${alerts} alertas preparados.`, context: ctx, actor });
  return { ok: true, summary: { linked, created, alerts } };
}

export async function cancelImport(seq: number, actor: AdminActor): Promise<ActionResult> {
  const job = await prisma.adminJob.findUnique({ where: { seq }, select: { state: true, source: true } });
  if (!job) return { ok: false, status: 404, error: "Job não encontrado." };
  if (job.state !== "RUNNING") return { ok: false, status: 409, error: "Só uma importação em revisão pode ser cancelada." };
  await prisma.$transaction([
    prisma.catalogConflict.deleteMany({ where: { jobSeq: seq, status: "PENDING" } }),
    prisma.adminJob.update({ where: { seq }, data: { state: "CANCELLED", finishedAt: new Date() } }),
  ]);
  await logEvent({ jobSeq: seq, source: job.source, event: "Import cancelled", message: "Importação cancelada antes do commit; nada foi aplicado.", context: `Job #${seq}`, actor });
  return { ok: true };
}

export async function removeOverride(id: string, actor: AdminActor): Promise<ActionResult> {
  const override = await prisma.catalogOverride.findUnique({ where: { id } });
  if (!override) return { ok: false, status: 404, error: "Override não encontrado." };
  if (override.removedAt) return { ok: false, status: 409, error: "Este override já foi removido." };
  await prisma.catalogOverride.update({ where: { id }, data: { removedAt: new Date(), removedByName: actor.name } });
  await logEvent({
    event: "Override removed",
    message: `${override.titleSnapshot} · EP${override.episode}: o horário volta ao valor original da fonte (${override.originalSource}).`,
    context: `Override #${id.slice(-6)} · ${override.field}`,
    actor,
  });
  return { ok: true };
}

/** Nova tentativa de um job que falhou: cria OUTRO job com o mesmo HTML (a falha antiga fica na auditoria). */
export async function retryImport(seq: number, actor: AdminActor): Promise<AnalyzeResult> {
  const job = await prisma.adminJob.findUnique({ where: { seq }, select: { html: true, source: true, season: true, state: true } });
  if (!job || !job.html) return { ok: false, error: "O HTML deste job não está mais disponível." };
  if (job.state !== "FAILED") return { ok: false, error: "Só um job com falha pode ser repetido." };
  return analyzeImport({ html: job.html, source: job.source, season: job.season ?? "", actor });
}

export type { JobStage, JobState, ScoreDetail };

import { prisma } from "@/lib/prisma";
import { loadActiveOverrides, overrideKey } from "@/lib/airingOverrides";
import { releaseState } from "@/lib/episodeState";
import { platformAnilistIds } from "@/lib/platform";
import { isTodaysRelease } from "@/lib/airingWindow";
import { resolveTimeZone } from "@/lib/timeZone";

/**
 * "Por que esta obra não apareceu na agenda?" (Fase 5, §8): as mesmas regras do calendário e do sino, verificadas uma a
 * uma para a obra (e, se informado, para uma pessoa). Cada verificação diz o que encontrou; a primeira que falha é a
 * explicação provável. Nada é alterado.
 */
export type DiagnosisCheck = { key: string; label: string; ok: boolean; detail: string; href?: string };
export type Diagnosis = { work: { id: string; title: string; anilistId: number | null } | null; checks: DiagnosisCheck[]; conclusion: string; episodes: Array<{ id: string; episode: number; state: string; at: string | null; overridden: boolean }> };

export async function diagnoseWork(input: { workId?: string; q?: string; user?: string }, now: Date = new Date()): Promise<Diagnosis> {
  const checks: DiagnosisCheck[] = [];
  const asId = input.q && /^\d{1,9}$/.test(input.q) ? Number(input.q) : null;
  const work = input.workId
    ? await prisma.catalogEntry.findUnique({ where: { id: input.workId } })
    : input.q
      ? await prisma.catalogEntry.findFirst({
          where: { OR: [...(asId !== null ? [{ anilistId: asId }] : []), { titleRomaji: { contains: input.q, mode: "insensitive" } }, { titleNative: { contains: input.q, mode: "insensitive" } }, { titleEnglish: { contains: input.q, mode: "insensitive" } }] },
          orderBy: [{ onPlatform: "desc" }, { seasonYear: "desc" }],
        })
      : null;
  if (!work) return { work: null, checks: [{ key: "work", label: "Obra no catálogo", ok: false, detail: "Nenhuma obra encontrada com esse título ou ID." }], conclusion: "A obra não está no catálogo: traga-a pelo painel de importação.", episodes: [] };

  const title = work.titleNative ?? work.titleRomaji;
  checks.push({ key: "platform", label: "Na plataforma", ok: work.onPlatform, detail: work.onPlatform ? "sim" : "não: obra só do cache de busca fica fora do calendário", href: `/admin/obras/${work.id}` });
  checks.push({ key: "anilist", label: "Tem AniList ID", ok: work.anilistId !== null, detail: work.anilistId !== null ? String(work.anilistId) : "não: a agenda vem da AniList, então obra só do AniDB não tem episódios com horário" });
  if (work.anilistId === null) return { work: { id: work.id, title, anilistId: null }, checks, conclusion: conclusionOf(checks), episodes: [] };
  const anilistId = work.anilistId;

  const [scope, rows, overrides, lastLoader, pendingConflicts] = await Promise.all([
    platformAnilistIds(),
    prisma.airingScheduleEntry.findMany({ where: { anilistId }, orderBy: { episode: "asc" }, select: { id: true, episode: true, airingAt: true, airDate: true, status: true } }),
    loadActiveOverrides([anilistId]),
    prisma.ingestionRun.findFirst({ where: { source: "calendar-loader" }, orderBy: { startedAt: "desc" } }),
    prisma.catalogConflict.count({ where: { anilistId, status: "PENDING" } }),
  ]);
  checks.push({ key: "scope", label: "No escopo do carregador da agenda", ok: scope.has(anilistId), detail: scope.has(anilistId) ? "sim" : "não: o carregador só lê obras da plataforma ou que alguém acompanha" });
  const loaderAge = lastLoader ? Math.round((now.getTime() - lastLoader.startedAt.getTime()) / 60_000) : null;
  checks.push({ key: "loader", label: "Carregador da agenda rodando", ok: lastLoader !== null && lastLoader.status !== "ERROR" && (loaderAge ?? 0) < 180, detail: lastLoader ? `última execução há ${loaderAge} min (${lastLoader.status})${lastLoader.message ? ` · ${lastLoader.message}` : ""}` : "nunca rodou", href: "/admin/scrapers" });

  const episodes = rows.map((r) => {
    const effective = overrides.get(overrideKey(anilistId, r.episode)) ?? r.airingAt;
    return { id: r.id, episode: r.episode, state: releaseState({ ...r, airingAt: effective }, now), at: effective ? effective.toISOString() : r.airDate ? r.airDate.toISOString().slice(0, 10) : null, overridden: overrides.has(overrideKey(anilistId, r.episode)) };
  });
  const future = episodes.filter((e) => e.state === "SCHEDULED");
  const undated = episodes.filter((e) => e.state === "UNKNOWN_DATE" || e.state === "EXPECTED");
  const halted = episodes.filter((e) => e.state === "POSTPONED" || e.state === "CANCELLED");
  checks.push({ key: "episodes", label: "Episódios cadastrados", ok: rows.length > 0, detail: rows.length > 0 ? `${rows.length} (${episodes.filter((e) => e.state === "AIRED").length} exibidos)` : "nenhum: a fonte ainda não informou episódios", href: `/admin/episodios?obra=${work.id}` });
  checks.push({ key: "future", label: "Próximo episódio com dia e hora", ok: future.length > 0, detail: future.length > 0 ? `EP${future[0].episode} · ${future[0].at}${future[0].overridden ? " (override)" : ""}` : work.status === "FINISHED" ? "nenhum: a obra terminou" : "nenhum com dia e hora — o calendário só mostra episódio com horário" });
  if (undated.length) checks.push({ key: "undated", label: "Episódios sem horário", ok: false, detail: `${undated.length}: só com o dia ou sem data não entram no calendário (horário não é inventado)` });
  if (halted.length) checks.push({ key: "halted", label: "Adiados ou cancelados", ok: false, detail: `${halted.map((e) => `EP${e.episode}`).join(", ")}: ficam fora do calendário e do sino` });
  if (pendingConflicts) checks.push({ key: "conflicts", label: "Conflitos de horário pendentes", ok: false, detail: `${pendingConflicts}: o calendário usa o valor atual até a decisão`, href: "/admin/conflitos" });
  if (work.streamingDelayMinutes) checks.push({ key: "delay", label: "Atraso do streaming", ok: true, detail: `${work.streamingSite ?? "streaming"} +${work.streamingDelayMinutes} min (o calendário mostra o horário da plataforma)` });

  if (input.user) {
    const who = input.user.trim().replace(/^@/, "");
    const person = await prisma.user.findFirst({ where: { OR: [{ handle: { equals: who, mode: "insensitive" } }, { email: { equals: who, mode: "insensitive" } }] }, select: { id: true, handle: true, timeZone: true, notifyReleases: true } });
    if (!person) {
      checks.push({ key: "user", label: "Pessoa", ok: false, detail: "não encontrada (use o @ do perfil ou o e-mail)" });
    } else {
      const zone = resolveTimeZone(person.timeZone);
      const [follow, postponed, alerts] = await Promise.all([
        prisma.anime.findUnique({ where: { userId_anilistId: { userId: person.id, anilistId } }, select: { waiting: true, watchState: true } }),
        prisma.pendingEpisode.count({ where: { userId: person.id, anilistId } }),
        prisma.airingAlert.findMany({ where: { userId: person.id, anilistId }, orderBy: { createdAt: "desc" }, take: 5 }),
      ]);
      checks.push({ key: "follows", label: `@${person.handle ?? "pessoa"} acompanha a obra`, ok: follow !== null, detail: follow ? "sim" : "não: só obras da lista aparecem como dela e geram avisos" });
      if (follow) {
        checks.push({ key: "waiting", label: "Fora do modo Espera", ok: !follow.waiting, detail: follow.waiting ? "em Espera: a obra sai da agenda pessoal e não gera aviso" : "sim" });
        checks.push({ key: "dropped", label: "Não dropada", ok: follow.watchState !== "DROPPED", detail: follow.watchState === "DROPPED" ? "dropada: fora do calendário e sem avisos" : "sim" });
      }
      checks.push({ key: "notify", label: "Avisos de lançamento ligados", ok: person.notifyReleases, detail: person.notifyReleases ? `sim · fuso ${zone}` : "desligados nas configurações da pessoa" });
      if (postponed) checks.push({ key: "postponed", label: "Obra adiada pela pessoa", ok: true, detail: "está em \"Para assistir\" (não tira da agenda)" });
      const next = future[0];
      if (next?.at) checks.push({ key: "today", label: "Aviso de hoje", ok: true, detail: isTodaysRelease(next.at, now, zone) ? "o próximo episódio sai hoje no fuso da pessoa: o sino avisa no próximo ciclo" : "o próximo episódio não é hoje no fuso da pessoa: o aviso sai no dia" });
      checks.push({ key: "alerts", label: "Avisos já emitidos", ok: true, detail: alerts.length ? alerts.map((a) => `EP${a.episode} em ${a.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC${a.previousAiringAt ? " (data alterada)" : ""}${a.seenAt ? " · visto" : ""}`).join("; ") : "nenhum para esta obra" });
    }
  }
  return { work: { id: work.id, title, anilistId }, checks, conclusion: conclusionOf(checks), episodes };
}

/** A explicação: o que é específico da obra e da pessoa vem antes do que é geral (o carregador parado afeta todas). */
const PRIORITY = ["work", "platform", "anilist", "scope", "user", "follows", "waiting", "dropped", "notify", "episodes", "future", "halted", "undated", "conflicts", "loader"];

function conclusionOf(checks: DiagnosisCheck[]): string {
  const failing = [...checks].sort((a, b) => PRIORITY.indexOf(a.key) - PRIORITY.indexOf(b.key)).find((c) => !c.ok);
  return failing ? `${failing.label}: ${failing.detail}.` : "Tudo certo: a obra deve aparecer no calendário quando houver episódio com dia e hora no período.";
}

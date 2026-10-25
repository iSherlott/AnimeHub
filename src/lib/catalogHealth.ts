import { prisma } from "@/lib/prisma";
import { QUALITY_FILTERS, type QualityFilter } from "@/lib/adminWorks";
import { runIntegrityChecks, type IntegrityCheck } from "@/lib/integrity";

/**
 * Saúde do catálogo (Fase 3, §5): indicadores contados no banco na hora (nada estimado), em ordem de prioridade —
 * o que aparece para as pessoas, o que afeta agenda e avisos, o que espera decisão humana, importação e infraestrutura,
 * e por último a qualidade menos crítica. Cada indicador diz o que conta e leva à lista já filtrada.
 */
export type HealthIndicator = { key: string; label: string; count: number; definition: string; href: string | null; tone: "ok" | "warning" | "critical" | "info" };
export type HealthGroup = { key: string; title: string; indicators: HealthIndicator[] };

const tone = (count: number, level: "warning" | "critical" | "info"): HealthIndicator["tone"] => (count === 0 ? "ok" : level);

async function quality(key: QualityFilter): Promise<number> {
  return prisma.catalogEntry.count({ where: { AND: [{ onPlatform: true }, QUALITY_FILTERS[key].where] } });
}

export async function loadCatalogHealth(): Promise<{ groups: HealthGroup[]; integrity: IntegrityCheck[]; totals: { catalog: number; onPlatform: number; cache: number } }> {
  const now = new Date();
  const staleMs = 3 * 3600_000;
  const [catalog, onPlatform, semSinopse, semTraducao, semTituloJa, semGenero, semCapa, semSite, semTipo, semFranquia, protegidas, conflicts, pendingRecords, pendingCandidates, duplicates, openIssues, runningJobs, failedJobs, futureEpisodes, lastLoader, failedRuns, integrity] = await Promise.all([
    prisma.catalogEntry.count(),
    prisma.catalogEntry.count({ where: { onPlatform: true } }),
    quality("sem-sinopse"),
    quality("sem-traducao"),
    quality("sem-titulo-ja"),
    quality("sem-genero"),
    quality("sem-capa"),
    quality("sem-site"),
    quality("sem-tipo"),
    quality("sem-franquia"),
    quality("protegida"),
    prisma.catalogConflict.count({ where: { status: "PENDING" } }),
    prisma.importRecord.count({ where: { state: "PENDING" } }),
    prisma.anidbCandidate.count({ where: { status: "PENDING" } }),
    prisma.curationIssue.count({ where: { code: "DUPLICATE_SUSPECT", status: "OPEN" } }),
    prisma.curationIssue.count({ where: { status: "OPEN" } }),
    prisma.adminJob.count({ where: { state: "RUNNING" } }),
    prisma.adminJob.count({ where: { state: "FAILED" } }),
    prisma.airingScheduleEntry.count({ where: { airingAt: { gt: now } } }),
    prisma.ingestionRun.findFirst({ where: { source: "calendar-loader" }, orderBy: { startedAt: "desc" } }),
    prisma.ingestionRun.count({ where: { status: "ERROR", startedAt: { gt: new Date(now.getTime() - 24 * 3600_000) } } }),
    runIntegrityChecks(),
  ]);
  const integrityBy = (impact: IntegrityCheck["impact"]) =>
    integrity.filter((c) => c.impact === impact).map((c) => ({ key: `integrity-${c.key}`, label: c.label, count: c.count, definition: c.hint, href: null, tone: tone(c.count, impact === "info" ? "info" : "critical") }) satisfies HealthIndicator);
  const loaderStale = !lastLoader || now.getTime() - lastLoader.startedAt.getTime() > staleMs;

  const groups: HealthGroup[] = [
    {
      key: "public",
      title: "O que aparece para as pessoas",
      indicators: [
        { key: "sem-sinopse", label: "Obras sem sinopse", count: semSinopse, definition: "na plataforma, sem sinopse em nenhum idioma", href: "/admin/obras?qualidade=sem-sinopse", tone: tone(semSinopse, "warning") },
        { key: "sem-traducao", label: "Sinopse sem português", count: semTraducao, definition: "tem sinopse original e ainda não tem tradução", href: "/admin/obras?qualidade=sem-traducao", tone: tone(semTraducao, "warning") },
        { key: "sem-titulo-ja", label: "Sem título japonês", count: semTituloJa, definition: "a obra não tem o título original", href: "/admin/obras?qualidade=sem-titulo-ja", tone: tone(semTituloJa, "warning") },
        { key: "sem-capa", label: "Sem capa", count: semCapa, definition: "a obra aparece sem imagem", href: "/admin/obras?qualidade=sem-capa", tone: tone(semCapa, "warning") },
        { key: "sem-genero", label: "Sem gênero", count: semGenero, definition: "não entra em nenhum filtro de gênero", href: "/admin/obras?qualidade=sem-genero", tone: tone(semGenero, "warning") },
        ...integrityBy("public"),
      ],
    },
    {
      key: "schedule",
      title: "Agenda e avisos",
      indicators: [
        { key: "loader", label: "Última atualização da agenda", count: lastLoader ? Math.round((now.getTime() - lastLoader.startedAt.getTime()) / 60_000) : -1, definition: lastLoader ? `há ${Math.round((now.getTime() - lastLoader.startedAt.getTime()) / 60_000)} min (${lastLoader.status}); o carregador roda a cada 30 min` : "o carregador da agenda nunca rodou", href: "/admin/scrapers", tone: loaderStale ? "critical" : "ok" },
        { key: "future", label: "Episódios futuros na agenda", count: futureEpisodes, definition: "episódios com data e horário depois de agora", href: null, tone: "info" },
        { key: "sem-franquia", label: "Séries fora de linha do tempo", count: semFranquia, definition: "série da AniList sem franquia (relações não resolvidas)", href: "/admin/obras?qualidade=sem-franquia", tone: tone(semFranquia, "warning") },
        ...integrityBy("schedule"),
      ],
    },
    {
      key: "decisions",
      title: "Esperando decisão",
      indicators: [
        { key: "conflicts", label: "Conflitos entre fontes", count: conflicts, definition: "horários divergentes aguardando escolha", href: "/admin/conflitos", tone: tone(conflicts, "critical") },
        { key: "pending-records", label: "Correspondências da importação", count: pendingRecords, definition: "registros de carga que não casaram sozinhos", href: "/admin/matching", tone: tone(pendingRecords, "warning") },
        { key: "candidates", label: "Candidatos AniDB → AniList", count: pendingCandidates, definition: "obras do AniDB que quase casaram com a AniList", href: "/admin/curadoria", tone: tone(pendingCandidates, "warning") },
        { key: "duplicates", label: "Obras possivelmente repetidas", count: duplicates, definition: "pendências DUPLICATE_SUSPECT abertas", href: "/admin/curadoria", tone: tone(duplicates, "warning") },
      ],
    },
    {
      key: "infra",
      title: "Importações e processos",
      indicators: [
        { key: "running", label: "Processos em execução", count: runningJobs, definition: "jobs RUNNING (importação, curadoria, tradução, linhas do tempo)", href: "/admin/jobs", tone: runningJobs > 0 ? "info" : "ok" },
        { key: "failed", label: "Processos com falha", count: failedJobs, definition: "jobs FAILED", href: "/admin/jobs", tone: tone(failedJobs, "critical") },
        { key: "failed-runs", label: "Falhas dos serviços (24 h)", count: failedRuns, definition: "execuções com erro dos serviços de fundo nas últimas 24 h", href: "/admin/scrapers", tone: tone(failedRuns, "critical") },
      ],
    },
    {
      key: "quality",
      title: "Qualidade (menos crítico)",
      indicators: [
        { key: "issues", label: "Pendências de curadoria abertas", count: openIssues, definition: "todas as pendências abertas, de qualquer tipo", href: "/admin/curadoria", tone: tone(openIssues, "info") },
        { key: "sem-site", label: "Sem site oficial", count: semSite, definition: "informativo: muitas fontes não têm", href: "/admin/obras?qualidade=sem-site", tone: tone(semSite, "info") },
        { key: "sem-tipo", label: "Sem formato ou tipo", count: semTipo, definition: "obras só do AniDB sem formato", href: "/admin/obras?qualidade=sem-tipo", tone: tone(semTipo, "warning") },
        { key: "protegidas", label: "Obras com campo manual", count: protegidas, definition: "têm ao menos um campo corrigido à mão (protegido)", href: "/admin/obras?qualidade=protegida", tone: "info" },
        ...integrityBy("info"),
      ],
    },
  ];
  return { groups, integrity, totals: { catalog, onPlatform, cache: catalog - onPlatform } };
}

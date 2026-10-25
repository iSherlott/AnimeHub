import { prisma } from "@/lib/prisma";
import { markCancelled, startExclusiveJob } from "@/lib/jobLock";
import { htmlToPlainText } from "@/lib/plainText";
import { storeSynopsis } from "@/lib/synopsis";
import { translateText, translationEngine, TranslationQuotaError, type TranslationTarget } from "@/lib/translate";

/**
 * Tradução em lote das sinopses do catálogo (Epic 44). O que a pessoa abre é traduzido na hora, mas o serviço gratuito tem
 * cota diária pequena; este motor percorre TODAS as sinopses sem tradução, das obras mais populares para as menos, e guarda
 * cada uma (`descriptionPt`/`descriptionJa`). É retomável: quem já tem tradução é pulado, e ele para sozinho quando a cota
 * do serviço acaba (para continuar no dia seguinte) ou quando o serviço não responde várias vezes seguidas.
 */
const STALE_AFTER_MS = 10 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 8;

export type TranslationProgress = {
  /** Parou a pedido (Fase 8). */
  cancelled?: boolean;
  lang: TranslationTarget;
  engine: "libretranslate" | "mymemory";
  /** Obras com sinopse original. */
  total: number;
  /** Já traduzidas (de execuções anteriores e desta). */
  done: number;
  /** Traduzidas nesta execução. */
  translated: number;
  failed: number;
  /** Parou porque a cota do serviço acabou. */
  quotaStopped: boolean;
  /** Parou porque o serviço de tradução não respondeu várias vezes seguidas. */
  unreachable: boolean;
  startedAt: string;
  updatedAt: string;
  finished: boolean;
  currentTitle: string | null;
};

type Translate = (text: string, lang: TranslationTarget) => Promise<string>;

const column = (lang: TranslationTarget) => (lang === "pt" ? "descriptionPt" : "descriptionJa");

/** Quantas obras têm sinopse original e quantas já têm a tradução. */
export async function translationTotals(lang: TranslationTarget): Promise<{ total: number; done: number }> {
  const col = column(lang);
  const [total, done] = await Promise.all([
    prisma.catalogEntry.count({ where: { onPlatform: true, description: { not: null } } }),
    prisma.catalogEntry.count({ where: { onPlatform: true, description: { not: null }, [col]: { not: null } } }),
  ]);
  return { total, done };
}

/** Traduções já guardadas no cache antigo (por anilistId) passam para a obra do catálogo, sem chamar serviço nenhum. */
async function backfillFromCache(lang: TranslationTarget): Promise<number> {
  const col = column(lang);
  const missing = await prisma.catalogEntry.findMany({ where: { onPlatform: true, anilistId: { not: null }, [col]: null }, select: { id: true, anilistId: true } });
  if (missing.length === 0) return 0;
  const cached = await prisma.synopsisTranslation.findMany({ where: { lang, anilistId: { in: missing.map((m) => m.anilistId as number) } }, select: { anilistId: true, text: true } });
  const byId = new Map(cached.map((c) => [c.anilistId, c.text]));
  let copied = 0;
  for (const entry of missing) {
    const text = byId.get(entry.anilistId as number);
    if (!text) continue;
    await prisma.catalogEntry.update({ where: { id: entry.id }, data: { [col]: text } });
    copied += 1;
  }
  return copied;
}

export async function runTranslation(
  seq: number,
  { lang = "pt", limit, translate = translateText, onBatch }: { lang?: TranslationTarget; limit?: number; translate?: Translate; onBatch?: (p: TranslationProgress) => void } = {}
): Promise<TranslationProgress> {
  await backfillFromCache(lang);
  const col = column(lang);
  const totals = await translationTotals(lang);
  const pending = await prisma.catalogEntry.findMany({
    where: { onPlatform: true, description: { not: null }, [col]: null },
    select: { id: true, anilistId: true, titleRomaji: true, description: true },
    orderBy: [{ popularityRank: { sort: "asc", nulls: "last" } }, { titleRomaji: "asc" }, { id: "asc" }],
    ...(limit ? { take: limit } : {}),
  });
  const progress: TranslationProgress = {
    lang,
    engine: translationEngine(),
    total: totals.total,
    done: totals.done,
    translated: 0,
    failed: 0,
    quotaStopped: false,
    unreachable: false,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finished: false,
    currentTitle: null,
  };
  const save = async (note: string) => {
    progress.updatedAt = new Date().toISOString();
    // Sinal de vida e pedido de cancelamento (Fase 8): os trabalhadores param no próximo item.
    const job = await prisma.adminJob.update({ where: { seq }, data: { processed: progress.done, total: progress.total, progressNote: note, resultJson: JSON.stringify(progress), heartbeatAt: new Date() }, select: { cancelRequestedAt: true } }).catch(() => null);
    if (job?.cancelRequestedAt) progress.cancelled = true;
    onBatch?.(progress);
  };
  await save(`Traduzindo ${pending.length} sinopses…`);

  // Vários pedidos ao mesmo tempo quando o motor aguenta (LibreTranslate próprio); o gratuito vai um por vez.
  const concurrency = Math.max(1, Math.min(16, Number(process.env.TRANSLATION_CONCURRENCY) || (translationEngine() === "libretranslate" ? 6 : 1)));
  let next = 0;
  let stop = false;
  let consecutiveFailures = 0;
  let sinceSave = 0;
  const worker = async () => {
    while (!stop && !progress.cancelled) {
      const entry = pending[next++];
      if (!entry) return;
      const original = htmlToPlainText(entry.description);
      progress.currentTitle = entry.titleRomaji;
      if (!original) {
        // Sinopse que vira texto vazio não tem o que traduzir: conta como resolvida para não travar o andamento.
        progress.done += 1;
        continue;
      }
      try {
        const text = await translate(original, lang);
        await storeSynopsis({ entryId: entry.id, anilistId: entry.anilistId, lang, text });
        progress.translated += 1;
        progress.done += 1;
        consecutiveFailures = 0;
      } catch (error) {
        if (error instanceof TranslationQuotaError) {
          progress.quotaStopped = true;
          stop = true;
          return;
        }
        progress.failed += 1;
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          progress.unreachable = true;
          stop = true;
          return;
        }
      }
      sinceSave += 1;
      if (sinceSave >= 10) {
        sinceSave = 0;
        await save(`Traduzindo as sinopses: ${progress.done} de ${progress.total}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  progress.finished = true;
  progress.currentTitle = null;
  return progress;
}

export async function createTranslationJob(actor: { id: string; name: string }, lang: TranslationTarget): Promise<{ seq: number } | { running: number }> {
  // Um por vez, de forma atômica (Fase 8, `jobLock`).
  const started = await startExclusiveJob("TRANSLATION", { source: "Catálogo", season: `Tradução das sinopses (${lang})`, stage: "COMMIT", progressNote: "Iniciando…", adminId: actor.id, adminName: actor.name }, STALE_AFTER_MS);
  return started.ok ? { seq: started.job.seq } : { running: started.running.seq };
}

/** Roda a tradução em lote como job auditável (SUCCESS com o resumo, ou FAILED com o motivo). */
export async function translateCatalog({
  actor,
  lang = "pt",
  limit,
  translate,
  onBatch,
}: {
  actor: { id: string; name: string };
  lang?: TranslationTarget;
  limit?: number;
  translate?: Translate;
  onBatch?: (p: TranslationProgress) => void;
}): Promise<TranslationProgress | { running: number }> {
  const created = await createTranslationJob(actor, lang);
  if ("running" in created) return created;
  try {
    const progress = await runTranslation(created.seq, { lang, limit, translate, onBatch });
    if (progress.cancelled) {
      await markCancelled(created.seq, `Cancelado a pedido depois de ${progress.done} sinopse(s); as traduzidas ficam.`);
      return progress;
    }
    await prisma.adminJob.update({
      where: { seq: created.seq },
      data: { state: "SUCCESS", stage: "NOTIFICATION", progressNote: null, processed: progress.done, total: progress.total, finishedAt: new Date(), resultJson: JSON.stringify(progress) },
    });
    return progress;
  } catch (error) {
    await prisma.adminJob
      .update({ where: { seq: created.seq }, data: { state: "FAILED", progressNote: null, finishedAt: new Date(), error: error instanceof Error ? error.message.slice(0, 300) : "Falha inesperada." } })
      .catch(() => undefined);
    throw error;
  }
}

export type TranslationStatus = {
  engine: "libretranslate" | "mymemory";
  job: { seq: number; state: string; error: string | null; finishedAt: string | null; progressNote: string | null } | null;
  progress: TranslationProgress | null;
  pt: { total: number; done: number };
  ja: { total: number; done: number };
};

export async function getTranslationStatus(): Promise<TranslationStatus> {
  const [job, pt, ja] = await Promise.all([prisma.adminJob.findFirst({ where: { kind: "TRANSLATION" }, orderBy: { seq: "desc" } }), translationTotals("pt"), translationTotals("ja")]);
  let progress: TranslationProgress | null = null;
  try {
    progress = job?.resultJson ? (JSON.parse(job.resultJson) as TranslationProgress) : null;
  } catch {
    progress = null;
  }
  return {
    engine: translationEngine(),
    job: job ? { seq: job.seq, state: job.state, error: job.error, finishedAt: job.finishedAt?.toISOString() ?? null, progressNote: job.progressNote } : null,
    progress,
    pt,
    ja,
  };
}

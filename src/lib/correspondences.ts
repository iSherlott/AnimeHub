import type { CatalogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTO_THRESHOLD, normalizeTitle } from "@/lib/adminImport/matching";

/**
 * Admin → Correspondências (Fase 6, §9): uma lista só para as decisões de identidade que antes ficavam espalhadas —
 * registros da importação do AniDB (`ImportRecord`) e obras só do AniDB com sugestão da AniList (`AnidbCandidate`).
 * A similaridade é sugestão, não prova: cada linha mostra o que coincide e o que diverge (título, ano, formato,
 * episódios) para o admin decidir. Nada é juntado sozinho.
 */
export type CorrespondenceKind = "import" | "anidb";
export const KIND_LABELS: Record<CorrespondenceKind, string> = { import: "Importação (HTML do AniDB)", anidb: "Obra só do AniDB → AniList" };
export const CORRESPONDENCE_STATES = { pendente: "Pendente", depois: "Revisar depois", decidida: "Decidida" } as const;
export type CorrespondenceState = keyof typeof CORRESPONDENCE_STATES;
export const DIVERGENCES = { titulo: "Título", ano: "Ano", formato: "Formato", episodios: "Episódios" } as const;
export type Divergence = keyof typeof DIVERGENCES;
export const CORRESPONDENCES_PAGE_SIZE = 50;

export type Side = { titleRomaji: string | null; titleNative: string | null; titleEnglish: string | null; year: number | null; format: string | null; episodes: number | null; description: string | null; ids: Record<string, number | string | null>; franchise: string | null; coverImage: string | null };

export type CorrespondenceRow = {
  key: string;
  kind: CorrespondenceKind;
  id: string;
  sourceLabel: string;
  received: Side;
  candidate: (Side & { catalogEntryId: string | null; anilistId: number | null }) | null;
  score: number | null;
  reason: string;
  matching: string[];
  diverging: Divergence[];
  state: CorrespondenceState;
  rawState: string;
  decidedBy: string | null;
  decidedAt: string | null;
  importedAt: string;
  jobSeq: number | null;
  /** Precisa de motivo para confirmar: similaridade abaixo do automático ou ano/formato divergente. */
  risky: boolean;
};

export type CorrespondenceFilters = { fonte: "" | CorrespondenceKind; estado: CorrespondenceState | "todas"; similaridade: string; divergencia: "" | Divergence; q: string; pagina: number };

export function parseCorrespondenceFilters(sp: URLSearchParams | Record<string, string | undefined>): CorrespondenceFilters {
  const get = (name: string) => ((sp instanceof URLSearchParams ? sp.get(name) : sp[name]) ?? "").trim();
  const estado = get("estado");
  return {
    fonte: get("fonte") === "import" || get("fonte") === "anidb" ? (get("fonte") as CorrespondenceKind) : "",
    estado: estado === "todas" || estado in CORRESPONDENCE_STATES ? (estado as CorrespondenceFilters["estado"]) : "pendente",
    similaridade: /^(0(\.\d+)?|1(\.0+)?)$/.test(get("similaridade")) ? get("similaridade") : "",
    divergencia: get("divergencia") in DIVERGENCES ? (get("divergencia") as Divergence) : "",
    q: get("q").slice(0, 80),
    pagina: Math.max(0, Math.min(10_000, Number(get("pagina")) || 0)),
  };
}

const yearOf = (e: Pick<CatalogEntry, "seasonYear" | "startDate"> | null) => e?.seasonYear ?? e?.startDate?.getUTCFullYear() ?? null;

function sideOf(e: CatalogEntry): Side {
  return {
    titleRomaji: e.titleRomaji,
    titleNative: e.titleNative,
    titleEnglish: e.titleEnglish,
    year: yearOf(e),
    format: e.format,
    episodes: e.episodes,
    description: e.descriptionPt ?? e.description,
    ids: { AniList: e.anilistId, AniDB: e.anidbId, Kitsu: e.kitsuId, MAL: e.malId },
    franchise: e.franchiseKey !== null ? `franquia ${e.franchiseKey}` : null,
    coverImage: e.coverImage,
  };
}

/** O que coincide e o que diverge entre o recebido e o candidato (só com os dois lados informados). */
export function compareSides(a: Side, b: Side | null): { matching: string[]; diverging: Divergence[] } {
  const matching: string[] = [];
  const diverging: Divergence[] = [];
  if (!b) return { matching, diverging };
  const titlesA = [a.titleRomaji, a.titleNative, a.titleEnglish].filter(Boolean).map((t) => normalizeTitle(t as string));
  const titlesB = [b.titleRomaji, b.titleNative, b.titleEnglish].filter(Boolean).map((t) => normalizeTitle(t as string));
  if (titlesA.some((t) => titlesB.includes(t))) matching.push("título");
  else if (titlesA.length && titlesB.length) diverging.push("titulo");
  const check = (both: boolean, same: boolean, label: string, key: Divergence) => {
    if (!both) return;
    if (same) matching.push(label);
    else diverging.push(key);
  };
  check(a.year !== null && b.year !== null, a.year === b.year, "ano", "ano");
  check(Boolean(a.format && b.format), a.format === b.format, "formato", "formato");
  check(a.episodes !== null && b.episodes !== null, a.episodes === b.episodes, "episódios", "episodios");
  return { matching, diverging };
}

function importState(state: string): CorrespondenceState {
  return state === "PENDING" ? "pendente" : "decidida";
}
function anidbState(status: string): CorrespondenceState {
  return status === "PENDING" ? "pendente" : status === "LATER" ? "depois" : "decidida";
}

async function importRows(f: CorrespondenceFilters): Promise<CorrespondenceRow[]> {
  if (f.estado === "depois") return [];
  const records = await prisma.importRecord.findMany({
    where: {
      ...(f.estado === "pendente" ? { state: "PENDING" } : f.estado === "decidida" ? { state: { in: ["CONFIRMED", "IGNORED", "NEW"] } } : { state: { in: ["PENDING", "CONFIRMED", "IGNORED", "NEW"] } }),
      ...(f.q ? { OR: [{ titleRomaji: { contains: f.q, mode: "insensitive" } }, { titleNative: { contains: f.q, mode: "insensitive" } }, { titleEnglish: { contains: f.q, mode: "insensitive" } }, { sourceKey: f.q }] } : {}),
    },
    orderBy: { capturedAt: "desc" },
    take: 2000,
  });
  const candidates = await prisma.catalogEntry.findMany({ where: { anilistId: { in: records.map((r) => r.matchedAnilistId).filter((x): x is number => x !== null) } } });
  const byAnilist = new Map(candidates.map((c) => [c.anilistId as number, c]));
  return records.map((r) => {
    const received: Side = { titleRomaji: r.titleRomaji, titleNative: r.titleNative, titleEnglish: r.titleEnglish, year: r.year, format: r.format, episodes: r.episodes, description: r.description, ids: { AniDB: r.sourceKey }, franchise: null, coverImage: r.imageUrl };
    const cand = r.matchedAnilistId !== null ? byAnilist.get(r.matchedAnilistId) : undefined;
    const candidate = cand ? { ...sideOf(cand), catalogEntryId: cand.id, anilistId: cand.anilistId } : r.matchedAnilistId !== null ? { titleRomaji: null, titleNative: null, titleEnglish: null, year: null, format: null, episodes: null, description: null, ids: { AniList: r.matchedAnilistId }, franchise: null, coverImage: null, catalogEntryId: null, anilistId: r.matchedAnilistId } : null;
    const { matching, diverging } = compareSides(received, candidate);
    return {
      key: `import:${r.id}`,
      kind: "import" as const,
      id: r.id,
      sourceLabel: `${KIND_LABELS.import} · lote #${r.jobSeq}`,
      received,
      candidate,
      score: r.score,
      reason: r.note ?? (r.score !== null ? (r.score >= AUTO_THRESHOLD ? "similaridade alta" : "similaridade abaixo do automático") : "sem candidato"),
      matching,
      diverging,
      state: importState(r.state),
      rawState: r.state,
      decidedBy: r.decidedByName,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      importedAt: r.capturedAt.toISOString(),
      jobSeq: r.jobSeq,
      risky: (r.score ?? 0) < AUTO_THRESHOLD || diverging.includes("ano") || diverging.includes("formato"),
    };
  });
}

async function anidbRows(f: CorrespondenceFilters): Promise<CorrespondenceRow[]> {
  const candidates = await prisma.anidbCandidate.findMany({
    where: f.estado === "pendente" ? { status: "PENDING" } : f.estado === "depois" ? { status: "LATER" } : f.estado === "decidida" ? { status: { in: ["REJECTED", "CONFIRMED"] } } : {},
    orderBy: { updatedAt: "desc" },
    take: 2000,
  });
  const [sources, targets] = await Promise.all([
    prisma.catalogEntry.findMany({ where: { anidbId: { in: candidates.map((c) => c.anidbId) } } }),
    prisma.catalogEntry.findMany({ where: { anilistId: { in: candidates.map((c) => c.anilistId) } } }),
  ]);
  const byAnidb = new Map(sources.map((s) => [s.anidbId as number, s]));
  const byAnilist = new Map(targets.map((t) => [t.anilistId as number, t]));
  const rows: CorrespondenceRow[] = [];
  for (const c of candidates) {
    const src = byAnidb.get(c.anidbId);
    const received: Side = src ? sideOf(src) : { titleRomaji: null, titleNative: null, titleEnglish: null, year: null, format: null, episodes: null, description: null, ids: { AniDB: c.anidbId }, franchise: null, coverImage: null };
    if (f.q && ![received.titleRomaji, received.titleNative, received.titleEnglish, c.candidateTitle, String(c.anidbId), String(c.anilistId)].some((t) => t && t.toLowerCase().includes(f.q.toLowerCase()))) continue;
    const t = byAnilist.get(c.anilistId);
    const candidate = t ? { ...sideOf(t), catalogEntryId: t.id, anilistId: t.anilistId } : { titleRomaji: c.candidateTitle, titleNative: null, titleEnglish: null, year: null, format: null, episodes: null, description: null, ids: { AniList: c.anilistId }, franchise: null, coverImage: null, catalogEntryId: null, anilistId: c.anilistId };
    const { matching, diverging } = compareSides(received, candidate);
    rows.push({
      key: `anidb:${c.anidbId}`,
      kind: "anidb",
      id: String(c.anidbId),
      sourceLabel: KIND_LABELS.anidb,
      received,
      candidate,
      score: c.score,
      reason: c.reason,
      matching,
      diverging,
      state: anidbState(c.status),
      rawState: c.status,
      decidedBy: c.decidedByName,
      decidedAt: c.status === "PENDING" ? null : c.updatedAt.toISOString(),
      importedAt: c.createdAt.toISOString(),
      jobSeq: null,
      risky: c.score < AUTO_THRESHOLD || diverging.includes("ano") || diverging.includes("formato"),
    });
  }
  return rows;
}

export async function loadCorrespondences(f: CorrespondenceFilters): Promise<{ rows: CorrespondenceRow[]; total: number; page: number; pages: number; all: CorrespondenceRow[] }> {
  const [imports, anidb] = await Promise.all([f.fonte === "anidb" ? [] : importRows(f), f.fonte === "import" ? [] : anidbRows(f)]);
  const min = f.similaridade ? Number(f.similaridade) : null;
  const all = [...imports, ...anidb]
    .filter((r) => (min === null ? true : (r.score ?? 0) >= min))
    .filter((r) => (f.divergencia ? r.diverging.includes(f.divergencia) : true))
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const page = f.pagina;
  return { all, total: all.length, page, pages: Math.max(1, Math.ceil(all.length / CORRESPONDENCES_PAGE_SIZE)), rows: all.slice(page * CORRESPONDENCES_PAGE_SIZE, (page + 1) * CORRESPONDENCES_PAGE_SIZE) };
}

export async function loadCorrespondence(kind: CorrespondenceKind, id: string): Promise<CorrespondenceRow | null> {
  const f: CorrespondenceFilters = { fonte: kind, estado: "todas", similaridade: "", divergencia: "", q: "", pagina: 0 };
  if (kind === "import") {
    const record = await prisma.importRecord.findUnique({ where: { id }, select: { titleRomaji: true } });
    if (!record) return null;
    return (await importRows({ ...f, q: record.titleRomaji })).find((r) => r.id === id) ?? null;
  }
  const anidbId = Number(id);
  if (!Number.isInteger(anidbId)) return null;
  return (await anidbRows({ ...f, q: String(anidbId) })).find((r) => r.id === id) ?? null;
}

/** O que muda ao confirmar (Fase 6): quem acompanha, episódios, páginas e franquia dos dois lados. */
export type CorrespondenceImpact = { target: { exists: boolean; onPlatform: boolean; followers: number; episodes: number; productions: number; franchise: string | null } | null; source: { followers: number; episodes: number } | null; effects: string[] };

export async function correspondenceImpact(row: CorrespondenceRow): Promise<CorrespondenceImpact> {
  const effects: string[] = [];
  const anilistId = row.candidate?.anilistId ?? null;
  let target: CorrespondenceImpact["target"] = null;
  if (anilistId !== null) {
    const [entry, followers, episodes, productions] = await Promise.all([
      prisma.catalogEntry.findUnique({ where: { anilistId }, select: { onPlatform: true, franchiseKey: true } }),
      prisma.anime.count({ where: { anilistId } }),
      prisma.airingScheduleEntry.count({ where: { anilistId } }),
      prisma.production.count({ where: { anilistId } }),
    ]);
    target = { exists: entry !== null, onPlatform: entry?.onPlatform ?? false, followers, episodes, productions, franchise: entry?.franchiseKey != null ? `franquia ${entry.franchiseKey}` : null };
    if (!entry) effects.push("A obra da AniList ainda não está no catálogo: será trazida.");
    else if (!entry.onPlatform) effects.push("A obra da AniList está só no cache: passa a aparecer na plataforma.");
    if (episodes) effects.push(`${episodes} episódio(s) da agenda passam a valer para esta obra.`);
    if (followers) effects.push(`${followers} pessoa(s) já acompanham a obra de destino.`);
  }
  let source: CorrespondenceImpact["source"] = null;
  if (row.kind === "anidb") {
    const entry = await prisma.catalogEntry.findFirst({ where: { anidbId: Number(row.id) }, select: { id: true } });
    if (entry) {
      const [followers, episodes] = await Promise.all([prisma.anime.count({ where: { catalogEntryId: entry.id } }), prisma.airingScheduleEntry.count({ where: { catalogEntryId: entry.id } })]);
      source = { followers, episodes };
      effects.push("A obra só do AniDB é juntada à da AniList: o ID do AniDB passa para ela e a cópia sem página deixa de existir (cópias, listas e agenda são repassadas).");
    }
  } else {
    effects.push("O registro do lote passa a apontar para esta obra; a aplicação acontece ao confirmar o lote.");
  }
  if (row.diverging.length) effects.push(`Atenção: diverge em ${row.diverging.map((d) => DIVERGENCES[d].toLowerCase()).join(", ")} — pode ser outra temporada, filme, OVA ou reboot.`);
  return { target, source, effects };
}

export function toCsv(rows: CorrespondenceRow[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["fonte", "registro", "titulo_recebido", "titulo_japones", "ano", "formato", "episodios", "candidato_anilist", "candidato_titulo", "similaridade", "coincide", "diverge", "estado", "decidido_por", "decidido_em", "importado_em"];
  const lines = rows.map((r) =>
    [r.kind, r.id, r.received.titleRomaji, r.received.titleNative, r.received.year, r.received.format, r.received.episodes, r.candidate?.anilistId, r.candidate?.titleRomaji, r.score?.toFixed(3), r.matching.join(" "), r.diverging.join(" "), r.rawState, r.decidedBy, r.decidedAt, r.importedAt].map(esc).join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export type CorrespondenceAction = "confirm" | "reject" | "later" | "new" | "relink";
export type CorrespondenceDecision = { action: CorrespondenceAction; reason?: string | null; anilistId?: number | null; productionId?: string | null };

/**
 * Aplica a decisão pelos caminhos que já existem (importação: `resolveRecord`; AniDB: `confirmCandidate`/
 * `rejectCandidate`), mais "revisar depois". Confirmar algo arriscado (similaridade baixa, ano ou formato diferente)
 * exige motivo, que fica no log com o nome de quem decidiu.
 */
export async function decideCorrespondence(kind: CorrespondenceKind, id: string, decision: CorrespondenceDecision, actor: { id: string; name: string }): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const row = await loadCorrespondence(kind, id);
  if (!row) return { ok: false, status: 404, error: "Correspondência não encontrada." };
  const reason = decision.reason?.trim() || null;
  if ((decision.action === "confirm" || decision.action === "relink") && row.risky && (!reason || reason.length < 3)) {
    return { ok: false, status: 400, error: "Esta correspondência tem risco (similaridade baixa ou ano/formato diferente): diga o motivo para confirmar." };
  }
  const { resolveRecord, logEvent } = await import("@/lib/adminImport/pipeline");
  const { confirmCandidate, rejectCandidate } = await import("@/lib/anidbCandidates");
  let result: { ok: true } | { ok: false; status: number; error: string };
  if (kind === "import") {
    switch (decision.action) {
      case "confirm":
        result = await resolveRecord(id, { action: "confirm" }, actor);
        break;
      case "reject":
        result = await resolveRecord(id, { action: "ignore", reason: reason ?? undefined }, actor);
        break;
      case "new":
        result = await resolveRecord(id, { action: "new" }, actor);
        break;
      case "relink":
        if (!decision.productionId) return { ok: false, status: 400, error: "Escolha o registro de destino." };
        result = await resolveRecord(id, { action: "candidate", productionId: decision.productionId }, actor);
        break;
      default:
        return { ok: false, status: 400, error: "Registro de importação não tem 'revisar depois': ele precisa ser decidido para o lote ser confirmado." };
    }
  } else {
    const anidbId = Number(id);
    switch (decision.action) {
      case "confirm":
        result = await confirmCandidate(anidbId, null, actor);
        break;
      case "relink":
        if (!decision.anilistId) return { ok: false, status: 400, error: "Escolha a obra da AniList." };
        result = await confirmCandidate(anidbId, decision.anilistId, actor);
        break;
      case "reject":
      case "new":
        // "Criar nova obra": a do AniDB segue como obra própria; a sugestão não volta.
        result = await rejectCandidate(anidbId, actor);
        break;
      case "later":
        await prisma.anidbCandidate.update({ where: { anidbId }, data: { status: "LATER", decidedByName: actor.name } });
        result = { ok: true };
        break;
    }
  }
  if (result.ok) {
    const target = decision.anilistId ?? row.candidate?.anilistId ?? null;
    await logEvent({
      source: kind === "import" ? "AniDB (HTML)" : "AniDB",
      event: "Correspondence decided",
      message: `${row.received.titleRomaji ?? row.id} → ${decision.action}${target ? ` (AniList ${target})` : ""}${reason ? ` · motivo: ${reason}` : ""}`,
      context: `Correspondências · ${row.key}`,
      actor,
    });
  }
  return result;
}

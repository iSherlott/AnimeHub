import { prisma } from "@/lib/prisma";
import { linkKey } from "./versions";

/**
 * Lote de pesquisa (Epic 48): o resultado de conferir, um par por vez, se duas obras são o mesmo enredo refeito (reboot), com os
 * arcos de cada versão; ou, só com `arcs` no lote, os arcos de uma obra que não depende de par nenhum (séries longas). Cada lote tem um nome, é validado inteiro antes de gravar nada e pode ser reaplicado (o que já existe é
 * atualizado, não duplicado). A pesquisa em si é feita por pessoa (ou por quem pesquisa a obra): o sistema só guarda e mostra.
 */
export type LootArc = { nameEn: string; namePt?: string | null; nameJa?: string | null; start: number; end: number };
export type LootReboot = { old: number; new: number; coverage: "FULL" | "PARTIAL"; beyondFromEpisode?: number | null; note?: string | null };
export type LootArcGroup = { anilistId: number; source?: string | null; list: LootArc[] };
export type LootItem = {
  a: number;
  b: number;
  verdict: "REBOOT" | "NOT_REBOOT";
  note?: string | null;
  source?: string | null;
  reboot?: LootReboot;
  arcs?: LootArcGroup[];
};
/** `items`: pares conferidos; `arcs`: arcos de obras avulsas. Pelo menos um dos dois. */
export type Loot = { loot: string; items?: LootItem[]; arcs?: LootArcGroup[] };

const MAX_ITEMS = 100;
const NAME = /^[a-z0-9][a-z0-9._-]{2,40}$/;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const optText = (v: unknown, max: number) => v === undefined || v === null || isText(v, max);

/** O que o lote precisa saber de cada obra: quantos episódios tem e quando estreou (para o reboot ser sempre o mais recente). */
export type Known = ReadonlyMap<number, { episodes: number | null; startMs?: number | null; title?: string }>;

/** Valida grupos de arcos (de um par ou avulsos): obra conhecida, sem repetir a obra, arcos em ordem e dentro dos episódios. */
function checkArcGroups(groups: unknown, at: string, known: Known, errors: string[]): void {
  const arcIds = new Set<number>();
  for (const [n, group] of (Array.isArray(groups) ? (groups as LootArcGroup[]) : []).entries()) {
    const where = `${at}[${n}]`;
    if (!isInt(group?.anilistId) || !known.has(group.anilistId)) errors.push(`${where}: anilistId desconhecido.`);
    else if (arcIds.has(group.anilistId)) errors.push(`${where}: a obra ${group.anilistId} aparece duas vezes nos arcos.`);
    else arcIds.add(group.anilistId);
    if (!optText(group?.source, 300)) errors.push(`${where}: source é um texto de até 300 caracteres.`);
    if (!Array.isArray(group?.list) || group.list.length === 0 || group.list.length > 40) {
      errors.push(`${where}: list precisa ter de 1 a 40 arcos.`);
      continue;
    }
    const episodes = isInt(group.anilistId) ? (known.get(group.anilistId)?.episodes ?? null) : null;
    let previousEnd = 0;
    group.list.forEach((arc, i) => {
      const w = `${where}.list[${i}]`;
      if (!isText(arc?.nameEn, 120)) errors.push(`${w}: nameEn é obrigatório (até 120 caracteres).`);
      if (!optText(arc?.namePt, 120) || !optText(arc?.nameJa, 120)) errors.push(`${w}: namePt e nameJa são textos de até 120 caracteres.`);
      if (!isInt(arc?.start) || !isInt(arc?.end) || arc.start < 1 || arc.end < arc.start) return void errors.push(`${w}: start e end precisam ser episódios (start ≤ end).`);
      if (arc.start <= previousEnd) errors.push(`${w}: os arcos precisam estar em ordem e sem sobreposição (começa no ${arc.start}, o anterior acaba no ${previousEnd}).`);
      if (episodes !== null && arc.end > episodes) errors.push(`${w}: o episódio ${arc.end} passa dos ${episodes} episódios da obra.`);
      previousEnd = arc.end;
    });
  }
}

export function validateLoot(input: unknown, known: Known): { ok: true; loot: Loot } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) return { ok: false, errors: ["O lote precisa ser um objeto { loot, items }."] };
  const raw = input as { loot?: unknown; items?: unknown; arcs?: unknown };
  if (typeof raw.loot !== "string" || !NAME.test(raw.loot)) errors.push("loot: dê um nome ao lote (letras minúsculas, números, ponto, hífen; 3 a 41 caracteres).");
  const items = raw.items === undefined ? [] : raw.items;
  const arcGroups = raw.arcs === undefined ? [] : raw.arcs;
  if (!Array.isArray(items)) errors.push("items: precisa ser uma lista de pares.");
  else if (items.length > MAX_ITEMS) errors.push(`items: no máximo ${MAX_ITEMS} pares por lote.`);
  if (!Array.isArray(arcGroups)) errors.push("arcs: precisa ser uma lista de obras com arcos.");
  else if (arcGroups.length > MAX_ITEMS) errors.push(`arcs: no máximo ${MAX_ITEMS} obras por lote.`);
  if (Array.isArray(items) && Array.isArray(arcGroups) && items.length === 0 && arcGroups.length === 0) errors.push("items: informe ao menos um par (ou arcs, com as obras e seus arcos).");
  if (errors.length > 0) return { ok: false, errors };
  checkArcGroups(arcGroups, "arcs", known, errors);

  const seenPairs = new Set<string>();
  (items as unknown[]).forEach((value, index) => {
    const at = `items[${index}]`;
    const item = value as LootItem;
    if (typeof value !== "object" || value === null) return void errors.push(`${at}: precisa ser um objeto.`);
    if (!isInt(item.a) || !isInt(item.b) || item.a === item.b || item.a < 1 || item.b < 1) return void errors.push(`${at}: a e b precisam ser ids diferentes da AniList.`);
    for (const id of [item.a, item.b]) if (!known.has(id)) errors.push(`${at}: a obra ${id} não está no catálogo.`);
    const key = linkKey(item.a, item.b);
    if (seenPairs.has(key)) errors.push(`${at}: o par ${item.a}/${item.b} aparece duas vezes no lote.`);
    seenPairs.add(key);
    if (item.verdict !== "REBOOT" && item.verdict !== "NOT_REBOOT") errors.push(`${at}: verdict deve ser REBOOT ou NOT_REBOOT.`);
    if (!optText(item.note, 600)) errors.push(`${at}: note é um texto de até 600 caracteres.`);
    if (!optText(item.source, 300)) errors.push(`${at}: source é um texto de até 300 caracteres.`);

    if (item.verdict === "REBOOT") {
      const r = item.reboot;
      if (!r || typeof r !== "object") errors.push(`${at}: um REBOOT precisa de reboot { old, new, coverage }.`);
      else {
        if (!((r.old === item.a && r.new === item.b) || (r.old === item.b && r.new === item.a))) errors.push(`${at}: reboot.old e reboot.new precisam ser as duas obras do par.`);
        // A versão mais atual é sempre o reboot: a refeita não pode ter estreado antes da antiga.
        const oldStart = known.get(r.old)?.startMs ?? null;
        const newStart = known.get(r.new)?.startMs ?? null;
        if (oldStart !== null && newStart !== null && newStart < oldStart) errors.push(`${at}: o reboot é sempre a versão mais atual, mas ${known.get(r.new)?.title ?? r.new} estreou antes de ${known.get(r.old)?.title ?? r.old}; troque reboot.old e reboot.new.`);
        if (r.coverage !== "FULL" && r.coverage !== "PARTIAL") errors.push(`${at}: reboot.coverage deve ser FULL ou PARTIAL.`);
        if (r.coverage === "PARTIAL") {
          const episodes = known.get(r.new)?.episodes ?? null;
          if (!isInt(r.beyondFromEpisode) || r.beyondFromEpisode < 1) errors.push(`${at}: um reboot PARTIAL precisa de beyondFromEpisode (episódio do reboot a partir do qual vai além da versão antiga).`);
          else if (episodes !== null && r.beyondFromEpisode > episodes) errors.push(`${at}: beyondFromEpisode (${r.beyondFromEpisode}) passa dos ${episodes} episódios do reboot.`);
        } else if (r.beyondFromEpisode !== undefined && r.beyondFromEpisode !== null) errors.push(`${at}: beyondFromEpisode só vale com coverage PARTIAL.`);
        if (!optText(r.note, 600)) errors.push(`${at}: reboot.note é um texto de até 600 caracteres.`);
      }
    } else if (item.reboot !== undefined) errors.push(`${at}: um par NOT_REBOOT não leva reboot.`);

    checkArcGroups(item.arcs ?? [], `${at}.arcs`, known, errors);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, loot: input as Loot };
}

export type LootResult = { loot: string; reviewed: number; reboots: number; notReboots: number; arcs: number };

/** Grava o lote inteiro de uma vez. Reaplicar o mesmo lote atualiza em vez de duplicar. */
export async function applyLoot(loot: Loot): Promise<LootResult> {
  const result: LootResult = { loot: loot.loot, reviewed: 0, reboots: 0, notReboots: 0, arcs: 0 };
  await prisma.$transaction(async (tx) => {
    const saveArcs = async (group: LootArcGroup, fallbackSource: string | null) => {
      await tx.storyArc.deleteMany({ where: { anilistId: group.anilistId } });
      await tx.storyArc.createMany({
        data: group.list.map((arc, position) => ({ anilistId: group.anilistId, position: position + 1, nameEn: arc.nameEn.trim(), namePt: arc.namePt?.trim() || null, nameJa: arc.nameJa?.trim() || null, startEpisode: arc.start, endEpisode: arc.end, source: group.source ?? fallbackSource, loot: loot.loot })),
      });
      result.arcs += group.list.length;
    };
    for (const item of loot.items ?? []) {
      const [lo, hi] = item.a < item.b ? [item.a, item.b] : [item.b, item.a];
      const common = { verdict: item.verdict, note: item.note ?? null, source: item.source ?? null, loot: loot.loot };
      await tx.storyReview.upsert({ where: { anilistIdA_anilistIdB: { anilistIdA: lo, anilistIdB: hi } }, create: { anilistIdA: lo, anilistIdB: hi, ...common }, update: { ...common, reviewedAt: new Date() } });
      result.reviewed += 1;
      if (item.verdict === "REBOOT" && item.reboot) {
        const r = item.reboot;
        const data = { kind: "REBOOT", coverage: r.coverage, beyondFromEpisode: r.coverage === "PARTIAL" ? (r.beyondFromEpisode ?? null) : null, note: r.note ?? null, source: item.source ?? null, loot: loot.loot };
        await tx.storyLink.upsert({ where: { oldAnilistId_newAnilistId: { oldAnilistId: r.old, newAnilistId: r.new } }, create: { oldAnilistId: r.old, newAnilistId: r.new, ...data }, update: data });
        result.reboots += 1;
      } else {
        // Uma nova conferência que concluiu "não é reboot" desfaz o vínculo que um lote anterior tivesse feito.
        await tx.storyLink.deleteMany({ where: { OR: [{ oldAnilistId: item.a, newAnilistId: item.b }, { oldAnilistId: item.b, newAnilistId: item.a }] } });
        result.notReboots += 1;
      }
      for (const group of item.arcs ?? []) await saveArcs(group, item.source ?? null);
    }
    for (const group of loot.arcs ?? []) await saveArcs(group, null);
  });
  return result;
}

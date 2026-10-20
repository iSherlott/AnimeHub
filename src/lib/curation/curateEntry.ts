import type { CurationMedia } from "@/lib/anilist";
import { getOfficialSiteUrl } from "@/lib/anilist";
import { ADULT_MARKER, normalizeGenres, visibleGenres } from "@/lib/genreTaxonomy";
import { classifyKind } from "./kind";
import type { IssueCode } from "./issues";

/** Versão das regras da curadoria: subir este número faz a próxima execução reprocessar o catálogo inteiro. */
export const CURATION_VERSION = 1;

export type CurateEntry = {
  anilistId: number | null;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  description: string | null;
  genres: string | null;
  format: string | null;
  kind: string | null;
  officialSite: string | null;
  relationsJson: string | null;
  descriptionPt: string | null;
  descriptionJa: string | null;
};

export type CuratePatch = {
  titleEnglish: string | null;
  titleNative: string | null;
  description: string | null;
  genres: string | null;
  format: string | null;
  kind: string | null;
  officialSite: string | null;
  relationsJson: string | null;
  descriptionPt: string | null;
  descriptionJa: string | null;
};

export type CurateResult = {
  patch: CuratePatch;
  /** A AniList marca a obra como adulta: sai da plataforma. */
  adult: boolean;
  issues: Array<{ code: IssueCode; detail?: string }>;
  /** Campos que a curadoria preencheu ou corrigiu nesta obra (para o painel de andamento). */
  changed: Array<"titles" | "synopsis" | "genres" | "officialSite" | "kind" | "format" | "relations" | "translations">;
};

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text ? text : null;
};

/** Os gêneros guardados como texto ("Comedy,Drama") viram lista; vocabulário antigo (Supernatural, Seinen) cai fora. */
export function parseStoredGenres(genres: string | null): string[] {
  return normalizeGenres((genres ?? "").split(","));
}

/**
 * Curadoria de UMA obra, sem tocar no banco: dada a obra do catálogo e (se houver) o que a AniList devolve hoje, diz o que
 * preencher, corrigir e o que fica pendente. Regra de ouro: nunca sobrescreve o que já existe (os títulos fixados pelo admin,
 * a sinopse do AniDB…) — só completa o que falta e recalcula o que é derivado (gêneros, tipo).
 */
export function curateEntry({
  entry,
  media,
  translations,
  anidbGenres = [],
}: {
  entry: CurateEntry;
  media: CurationMedia | null;
  translations: { pt?: string | null; ja?: string | null };
  /** Gêneros que o AniDB deu à obra (lidos do HTML da carga com o vocabulário atual). */
  anidbGenres?: string[];
}): CurateResult {
  const issues: CurateResult["issues"] = [];
  const changed = new Set<CurateResult["changed"][number]>();

  if (entry.anilistId !== null && !media) issues.push({ code: "ANILIST_NOT_FOUND" });

  const adult = Boolean(media && (media.isAdult || media.genres.includes(ADULT_MARKER)));
  if (adult) issues.push({ code: "ADULT_REMOVED" });

  const titleEnglish = clean(entry.titleEnglish) ?? clean(media?.title.english);
  const titleNative = clean(entry.titleNative) ?? clean(media?.title.native);
  if (titleEnglish !== clean(entry.titleEnglish) || titleNative !== clean(entry.titleNative)) changed.add("titles");
  if (!titleEnglish) issues.push({ code: "TITLE_EN_MISSING" });
  if (!titleNative) issues.push({ code: "TITLE_JA_MISSING" });

  const description = clean(entry.description) ?? clean(media?.description);
  if (description !== clean(entry.description)) changed.add("synopsis");
  if (!description) issues.push({ code: "SYNOPSIS_EN_MISSING" });

  // Gêneros: o que a obra já tinha (no vocabulário atual) mais o que as fontes trazem hoje (AniList: gêneros + etiquetas; AniDB: tags).
  const merged = visibleGenres(normalizeGenres([...parseStoredGenres(entry.genres), ...(media?.genres ?? []), ...anidbGenres]));
  const genres = merged.length ? merged.join(",") : null;
  if ((genres ?? "") !== (entry.genres ?? "")) changed.add("genres");
  if (!genres) issues.push({ code: "NO_GENRE" });

  const format = clean(media?.format) ?? clean(entry.format);
  if (format !== clean(entry.format)) changed.add("format");
  const kind = classifyKind({ format, title: entry.titleRomaji });
  if (kind !== entry.kind) changed.add("kind");
  if (!kind) issues.push({ code: "KIND_UNKNOWN" });

  const officialSite = clean(entry.officialSite) ?? (media ? clean(getOfficialSiteUrl(media)) : null);
  if (officialSite !== clean(entry.officialSite)) changed.add("officialSite");
  if (!officialSite) issues.push({ code: "OFFICIAL_SITE_MISSING" });

  const relationsJson = media ? JSON.stringify(media.relations) : entry.relationsJson;
  if (relationsJson !== entry.relationsJson) changed.add("relations");

  const descriptionPt = clean(translations.pt) ?? clean(entry.descriptionPt);
  const descriptionJa = clean(translations.ja) ?? clean(entry.descriptionJa);
  if (descriptionPt !== clean(entry.descriptionPt) || descriptionJa !== clean(entry.descriptionJa)) changed.add("translations");

  return {
    patch: { titleEnglish, titleNative, description, genres, format, kind, officialSite, relationsJson, descriptionPt, descriptionJa },
    adult,
    issues,
    changed: Array.from(changed),
  };
}

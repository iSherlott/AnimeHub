/** Tipos e rótulos dos extras do AniDB (sem banco: usado também no navegador). Ver `episodeExtras.ts`. */
export const EXTRA_KINDS = { SPECIAL: "Especiais", CREDIT: "Aberturas e encerramentos", TRAILER: "Trailers e promocionais", PARODY: "Paródias", OTHER: "Outros" } as const;
export type ExtraKind = keyof typeof EXTRA_KINDS;

export type ExtraView = { id: string; code: string; kind: ExtraKind; number: number; title: string | null; titleEn: string | null; titleJa: string | null; synopsis: string | null; airDate: string | null };

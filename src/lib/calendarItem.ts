import type { AiringScheduleEntry } from "@prisma/client";

export type CalendarItem = {
  key: string;
  anilistId: number;
  animeId: string | null;
  episode: number;
  airingAt: string;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  /** Só preenchido quando `inMyList` — não existe fonte pra isso vindo do
   * cache de calendário (AiringScheduleEntry), só da própria linha de
   * Anime do usuário. */
  titlePortuguese: string | null;
  coverImage: string | null;
  /** Miniatura do EPISÓDIO (só existe para obras da lista com episódios carregados);
   * sem ela, a interface mostra a capa do anime. */
  episodeImage: string | null;
  genres: string[];
  inMyList: boolean;
  /** Sinopse original. A semana do calendário NÃO a traz (pesava centenas de KB): a prévia pede a da obra ao abrir
   * (/api/catalog/preview, que dá preferência à da lista da pessoa). Fica opcional para quem já a tiver em mãos. */
  description?: string | null;
  /** Tradução manual da pessoa (só obras da lista — não existe onde guardar uma para anime sem dono). */
  descriptionPortuguese: string | null;
  isFavorite: boolean;
  /** Está na lista mas em modo "Espera" (não conta como `inMyList`). */
  waiting?: boolean;
  /** "Obra adiada" (D5): a pessoa adiou a obra (lembrete em "Para assistir"; ver `PendingEpisode`). Só obras da lista. */
  postponed?: boolean;
  /** Episódios exibidos em sequência no mesmo dia viram UM item (ver `mergeConsecutiveEpisodes`): último episódio do bloco... */
  episodeEnd?: number;
  /** ...horário do último episódio do bloco... */
  lastAiringAt?: string;
  /** ...e quando o bloco termina (último episódio + a duração de um espaço). */
  endsAt?: string;
  /** Atraso do streaming (Epic 50): `airingAt` já é o horário da plataforma; aqui, qual plataforma e o horário da TV japonesa. */
  streamingSite?: string | null;
  tvAiringAt?: string;
};

export type OwnedAnimeCalendarInfo = {
  id: string;
  titlePortuguese: string | null;
  /** Reservas para quando a linha da agenda (Kitsu/AniDB) veio sem título japonês, inglês ou capa. */
  titleNative?: string | null;
  titleEnglish?: string | null;
  coverImage?: string | null;
  descriptionPortuguese: string | null;
  isFavorite: boolean;
  waiting?: boolean;
};

export function calendarItemFromCache(
  entry: AiringScheduleEntry & { airingAt: Date; anilistId: number },
  myAnimeByAnilistId: Map<number, OwnedAnimeCalendarInfo>,
  episodeImage: string | null = null,
  postponed = false
): CalendarItem {
  const owned = myAnimeByAnilistId.get(entry.anilistId) ?? null;
  return {
    key: `${entry.anilistId}-${entry.episode}`,
    anilistId: entry.anilistId,
    animeId: owned?.id ?? null,
    episode: entry.episode,
    airingAt: entry.airingAt.toISOString(),
    titleRomaji: entry.titleRomaji,
    // A linha da agenda vinda da Kitsu/AniDB pode não ter o título japonês, o inglês ou a capa: usa os da obra da lista.
    titleEnglish: entry.titleEnglish ?? owned?.titleEnglish ?? null,
    titleNative: entry.titleNative ?? owned?.titleNative ?? null,
    titlePortuguese: owned?.titlePortuguese ?? null,
    coverImage: entry.coverImage ?? owned?.coverImage ?? null,
    episodeImage,
    genres: entry.genres ? entry.genres.split(",").filter(Boolean) : [],
    inMyList: owned !== null && !owned.waiting,
    waiting: owned?.waiting ?? false,
    descriptionPortuguese: owned?.descriptionPortuguese ?? null,
    isFavorite: owned?.isFavorite ?? false,
    postponed: Boolean(owned && !owned.waiting && postponed),
  };
}

/** Dois episódios do mesmo anime com até esta distância entre os inícios são "em sequência" (maratona do dia). */
export const CONSECUTIVE_GAP_MS = 60 * 60 * 1000;
/** Duração assumida de um episódio quando o bloco só tem um espaço de referência. */
const DEFAULT_SLOT_MS = 30 * 60 * 1000;

/**
 * Funde episódios exibidos em sequência no mesmo dia (ex.: EP01 às 13:00 e
 * EP02 às 13:30) num único item: começa no primeiro, vai até o fim do último
 * (`endsAt`) e guarda a faixa de episódios (`episode`–`episodeEnd`). A lista de
 * entrada precisa ser do MESMO dia e estar em ordem de horário; a ordem é mantida.
 */
export function mergeConsecutiveEpisodes(items: CalendarItem[], maxGapMs: number = CONSECUTIVE_GAP_MS): CalendarItem[] {
  const result: CalendarItem[] = [];
  const open = new Map<number, number>(); // anilistId -> índice do bloco aberto em `result`
  for (const item of items) {
    const index = open.get(item.anilistId);
    const block = index === undefined ? undefined : result[index];
    const previousAt = block ? new Date(block.lastAiringAt ?? block.airingAt).getTime() : 0;
    const at = new Date(item.airingAt).getTime();
    if (block && at - previousAt <= maxGapMs && item.episode > (block.episodeEnd ?? block.episode)) {
      const slot = at - previousAt > 0 ? at - previousAt : DEFAULT_SLOT_MS;
      result[index as number] = {
        ...block,
        episodeEnd: item.episode,
        lastAiringAt: item.airingAt,
        endsAt: new Date(at + slot).toISOString(),
        inMyList: block.inMyList || item.inMyList,
      };
      continue;
    }
    open.set(item.anilistId, result.length);
    result.push(item);
  }
  return result;
}

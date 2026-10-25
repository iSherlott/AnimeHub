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
  /** Sinopse (Epic 29) — vem da própria linha de Anime do usuário
   * quando está na lista, senão do cache de calendário
   * (AiringScheduleEntry.description, pedido na mesma busca AniList
   * que já traz o resto da entrada). `descriptionPortuguese` continua
   * só disponível na lista — não existe onde guardar uma tradução
   * manual pra anime sem dono. */
  description: string | null;
  descriptionPortuguese: string | null;
  /** Sinopse já traduzida guardada no catálogo (português e japonês), para o preview nascer no idioma certo. */
  storedSynopsis?: { pt: string | null; ja: string | null };
  isFavorite: boolean;
  /** Está na lista mas em modo "Espera" (não conta como `inMyList`). */
  waiting?: boolean;
  /** "Obra adiada" (D5): a pessoa adiou a obra (lembrete em "Para assistir"; ver `PendingEpisode`). Só obras da lista. */
  postponed?: boolean;
  /** "Atrasado" (Figma `8:2106`): o horário previsto passou e a fonte ainda
   * não confirmou o episódio — ver `isDelayed`. A previsão original é mantida. */
  delayed: boolean;
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
  description: string | null;
  descriptionPortuguese: string | null;
  isFavorite: boolean;
  waiting?: boolean;
};

export function calendarItemFromCache(
  entry: AiringScheduleEntry & { airingAt: Date; anilistId: number },
  myAnimeByAnilistId: Map<number, OwnedAnimeCalendarInfo>,
  delayed = false,
  episodeImage: string | null = null,
  postponed = false,
  storedSynopsis: { pt: string | null; ja: string | null } | null = null
): CalendarItem {
  const owned = myAnimeByAnilistId.get(entry.anilistId) ?? null;
  return {
    key: `${entry.anilistId}-${entry.episode}`,
    anilistId: entry.anilistId,
    animeId: owned?.id ?? null,
    episode: entry.episode,
    airingAt: entry.airingAt.toISOString(),
    titleRomaji: entry.titleRomaji,
    titleEnglish: entry.titleEnglish,
    titleNative: entry.titleNative,
    titlePortuguese: owned?.titlePortuguese ?? null,
    coverImage: entry.coverImage,
    episodeImage,
    genres: entry.genres ? entry.genres.split(",").filter(Boolean) : [],
    inMyList: owned !== null && !owned.waiting,
    waiting: owned?.waiting ?? false,
    description: owned?.description ?? entry.description ?? null,
    descriptionPortuguese: owned?.descriptionPortuguese ?? null,
    ...(storedSynopsis && (storedSynopsis.pt || storedSynopsis.ja) ? { storedSynopsis } : {}),
    isFavorite: owned?.isFavorite ?? false,
    postponed: Boolean(owned && !owned.waiting && postponed),
    delayed,
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
        delayed: block.delayed || item.delayed,
        inMyList: block.inMyList || item.inMyList,
      };
      continue;
    }
    open.set(item.anilistId, result.length);
    result.push(item);
  }
  return result;
}

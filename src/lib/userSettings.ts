import { isValidTimeZone, DEVICE_TIME_ZONE } from "@/lib/timeZone";

/**
 * Preferências da conta (Figma `8:3333` e `13:42966`). Validação pura,
 * usada pela rota PATCH /api/users/me/settings e testada sem banco.
 */
export const TITLE_FORMATS = ["ja", "romaji"] as const;
export type TitleFormat = (typeof TITLE_FORMATS)[number];
/** Idioma da sinopse quando os títulos estão em japonês (pt é o padrão). */
export const SYNOPSIS_LANGUAGES = ["pt", "ja"] as const;
export type SynopsisLanguage = (typeof SYNOPSIS_LANGUAGES)[number];

export type UserPreferences = {
  titleFormat: TitleFormat | null;
  synopsisLanguage: SynopsisLanguage | null;
  timeZone: string | null;
  notifyReleases: boolean;
  notifyReplies: boolean;
  notifyComments: boolean;
  notifyFollowers: boolean;
  notifyLikes: boolean;
  /** Avisos das comunidades: respostas nos tópicos em que a pessoa participa e eventos novos. */
  notifyCommunity: boolean;
  /** A aba Animes do perfil (obras acompanhadas) aparece para quem visita. */
  animeListPublic: boolean;
  /** Visitas ao perfil: registrar as minhas (desligado, também não vejo quem visitou o meu). */
  recordVisits: boolean;
};

export type UserPreferencesPatch = Partial<UserPreferences>;

const BOOLEAN_KEYS = ["notifyReleases", "notifyReplies", "notifyComments", "notifyFollowers", "notifyLikes", "notifyCommunity", "animeListPublic", "recordVisits"] as const;

export type ValidationResult = { ok: true; patch: UserPreferencesPatch } | { ok: false; error: string };

export function validateSettingsPatch(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Corpo da requisição inválido" };
  }
  const input = body as Record<string, unknown>;
  const patch: UserPreferencesPatch = {};

  if ("titleFormat" in input) {
    const v = input.titleFormat;
    if (v === null) patch.titleFormat = null;
    else if (typeof v === "string" && (TITLE_FORMATS as readonly string[]).includes(v)) patch.titleFormat = v as TitleFormat;
    else return { ok: false, error: "Formato de título inválido" };
  }

  if ("synopsisLanguage" in input) {
    const v = input.synopsisLanguage;
    if (v === null) patch.synopsisLanguage = null;
    else if (typeof v === "string" && (SYNOPSIS_LANGUAGES as readonly string[]).includes(v)) patch.synopsisLanguage = v as SynopsisLanguage;
    else return { ok: false, error: "Idioma da sinopse inválido" };
  }

  if ("timeZone" in input) {
    const v = input.timeZone;
    if (v === null || v === DEVICE_TIME_ZONE) patch.timeZone = v;
    else if (isValidTimeZone(v)) patch.timeZone = v;
    else return { ok: false, error: "Fuso horário inválido" };
  }

  for (const key of BOOLEAN_KEYS) {
    if (key in input) {
      if (typeof input[key] !== "boolean") return { ok: false, error: `Valor inválido em ${key}` };
      patch[key] = input[key] as boolean;
    }
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "Nenhuma preferência informada" };
  return { ok: true, patch };
}

/**
 * "Desativar todo o Social" (Figma `13:42966`): desliga as preferências
 * sociais (e a das comunidades) SEM tocar em `notifyReleases` — os canais são independentes.
 */
export const SOCIAL_OFF_PATCH: UserPreferencesPatch = {
  notifyReplies: false,
  notifyComments: false,
  notifyFollowers: false,
  notifyLikes: false,
  notifyCommunity: false,
};

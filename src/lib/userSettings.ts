import { isValidTimeZone, DEVICE_TIME_ZONE } from "@/lib/timeZone";

/**
 * Preferências da conta (Figma `8:3333` e `13:42966`). Validação pura,
 * usada pela rota PATCH /api/users/me/settings e testada sem banco.
 */
export const TITLE_FORMATS = ["ja", "romaji"] as const;
export type TitleFormat = (typeof TITLE_FORMATS)[number];

export type UserPreferences = {
  titleFormat: TitleFormat | null;
  timeZone: string | null;
  notifyReleases: boolean;
  notifyReplies: boolean;
  notifyComments: boolean;
  notifyFollowers: boolean;
  notifyLikes: boolean;
};

export type UserPreferencesPatch = Partial<UserPreferences>;

const BOOLEAN_KEYS = ["notifyReleases", "notifyReplies", "notifyComments", "notifyFollowers", "notifyLikes"] as const;

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
 * "Desativar todo o Social" (Figma `13:42966`): desliga as 4 preferências
 * sociais SEM tocar em `notifyReleases` — os canais são independentes.
 */
export const SOCIAL_OFF_PATCH: UserPreferencesPatch = {
  notifyReplies: false,
  notifyComments: false,
  notifyFollowers: false,
  notifyLikes: false,
};

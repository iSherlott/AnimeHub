/**
 * Nome de usuário (@identificador do perfil; PROF-001, Figma `13:43571`): único, sem
 * diferenciar maiúsculas, só letras ASCII minúsculas, números e "_", sem espaço.
 * Guardado SEMPRE em minúsculas (a unicidade vive no banco). É fixo: só o administrador
 * o define, ao criar a conta (ou depois, para contas antigas que ainda não têm).
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

const HANDLE_PATTERN = /^[a-z0-9_]+$/;

/** Rotas/nomes que um identificador não pode ocupar. */
const RESERVED = new Set(["admin", "administrador", "anime", "animehub", "suporte", "moderacao", "sistema", "voce", "eu"]);

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/** Mensagem de erro (em português) ou null quando o identificador é válido. */
export function validateHandle(normalized: string): string | null {
  if (normalized.length < HANDLE_MIN || normalized.length > HANDLE_MAX) {
    return `O nome de usuário precisa ter de ${HANDLE_MIN} a ${HANDLE_MAX} caracteres`;
  }
  if (!HANDLE_PATTERN.test(normalized)) {
    return "Use apenas letras minúsculas sem acento, números e _ no nome de usuário (sem espaço)";
  }
  if (RESERVED.has(normalized)) return "Esse nome de usuário não está disponível";
  return null;
}

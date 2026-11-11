/** Enquete nas publicações do Feed (12/11/2026): regras e formato que o navegador também usa. Ver postPolls.ts. */
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;
export const POLL_OPTION_MAX = 80;
/** Duração em dias; null = fica aberta. */
export const POLL_DURATIONS = [1, 3, 7] as const;

export type PostPollDTO = {
  options: { id: string; label: string; votes: number }[];
  total: number;
  /** A opção em que quem vê votou (null = não votou). */
  myOptionId: string | null;
  closesAt: string | null;
  closed: boolean;
};

export type PollInput = { options: string[]; days: number | null };

/** Confere a enquete do pedido: de 2 a 4 opções, sem repetir, até 80 caracteres; null = pedido sem enquete. */
export function parsePollInput(raw: unknown): { ok: true; poll: PollInput | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, poll: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Enquete inválida" };
  const { options, days } = raw as { options?: unknown; days?: unknown };
  if (!Array.isArray(options)) return { ok: false, error: "Enquete inválida" };
  const clean = options.map((o) => (typeof o === "string" ? o.trim() : "")).filter(Boolean);
  if (clean.length < POLL_MIN_OPTIONS || clean.length > POLL_MAX_OPTIONS) return { ok: false, error: `A enquete precisa de ${POLL_MIN_OPTIONS} a ${POLL_MAX_OPTIONS} opções.` };
  if (clean.some((o) => o.length > POLL_OPTION_MAX)) return { ok: false, error: `Cada opção pode ter até ${POLL_OPTION_MAX} caracteres.` };
  if (new Set(clean.map((o) => o.toLowerCase())).size !== clean.length) return { ok: false, error: "As opções da enquete não podem se repetir." };
  if (days !== undefined && days !== null && !(POLL_DURATIONS as readonly number[]).includes(days as number)) return { ok: false, error: "Duração da enquete inválida." };
  return { ok: true, poll: { options: clean, days: (days as number | null | undefined) ?? null } };
}

/**
 * Sugestão de nome de usuário (@) para as contas antigas que ainda não têm. As regras são as de src/lib/handle.ts
 * (3 a 20 letras minúsculas sem acento, números ou _, sem espaço, fora da lista de reservados); este arquivo é .mjs para
 * rodar no cluster com Node 20, sem TypeScript, e o teste src/lib/handleSuggestion.test.ts confere que não divergem.
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const HANDLE_PATTERN = /^[a-z0-9_]+$/;
export const RESERVED_HANDLES = ["admin", "administrador", "anime", "animehub", "suporte", "moderacao", "sistema", "voce", "eu"];

/** "Sherlott Silva" → "sherlott_silva"; "João-Pedro!" → "joao_pedro". */
export function slugHandle(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/_+$/g, "");
}

/** Um @ válido e livre: o que vem do nome; sem nome que sirva, o começo do e-mail; no fim, "membro". Repetido ganha _2, _3… */
export function suggestHandle(displayName, email, taken) {
  const fromName = slugHandle(displayName);
  const fromEmail = slugHandle(String(email ?? "").split("@")[0]);
  const base = fromName.length >= HANDLE_MIN ? fromName : fromEmail.length >= HANDLE_MIN ? fromEmail : "membro";
  const free = (h) => !taken.has(h) && !RESERVED_HANDLES.includes(h);
  if (free(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `_${n}`;
    const candidate = `${base.slice(0, HANDLE_MAX - suffix.length).replace(/_+$/g, "")}${suffix}`;
    if (free(candidate)) return candidate;
  }
}

/** O @ escolhido à mão (`--definir email=usuario`): mensagem de erro ou null. */
export function handleProblem(handle, taken) {
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) return `precisa ter de ${HANDLE_MIN} a ${HANDLE_MAX} caracteres`;
  if (!HANDLE_PATTERN.test(handle)) return "use só letras minúsculas sem acento, números e _ (sem espaço)";
  if (RESERVED_HANDLES.includes(handle)) return "é um nome reservado";
  if (taken.has(handle)) return "já está em uso";
  return null;
}

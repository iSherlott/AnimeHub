/**
 * Destino pós-login (D-04): volta ao ponto de origem, validado contra
 * open redirect. Só caminhos relativos do próprio site são aceitos.
 */
const MAX_LENGTH = 500;
// Telas de autenticação nunca são destino (evita loop login → login).
const AUTH_PATHS = ["/login", "/signup", "/trocar-senha"];

export function sanitizeNext(raw: string | null | undefined, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // Caracteres de controle e barras invertidas permitem truques de parsing em alguns navegadores.
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f || ch === "\\") return fallback;
  }
  const pathOnly = raw.split(/[?#]/)[0];
  if (AUTH_PATHS.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) return fallback;
  return raw;
}

/** `/login?next=<destino>` — o destino também é validado na ida. */
export function loginHref(next: string | null | undefined): string {
  const safe = sanitizeNext(next, "");
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

/** Lê e valida `?next=` da URL atual — só chamar no navegador (handlers/efeitos). */
export function readNextFromLocation(fallback = "/"): string {
  return sanitizeNext(new URLSearchParams(window.location.search).get("next"), fallback);
}

/**
 * Rate limit em memória, janela fixa (GAP-S-02). Por processo: serve contra
 * força bruta e amplificação contra APIs externas numa réplica única (o
 * deploy atual). Com várias réplicas cada uma conta separado — trocar por
 * Redis/Postgres se o deploy escalar. Desligável por env nos testes E2E.
 */
type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();
const MAX_KEYS = 10_000;

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSec: number };

function disabled(): boolean {
  return process.env.ANIME_HUB_RATE_LIMIT_DISABLED === "1";
}

function liveEntry(key: string, now: number): Entry | undefined {
  const entry = store.get(key);
  if (entry && entry.resetAt <= now) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

/** Só consulta (não conta). */
export function peekRateLimit(key: string, limit: number, now = Date.now()): RateLimitResult {
  if (disabled()) return { allowed: true, remaining: limit, retryAfterSec: 0 };
  const entry = liveEntry(key, now);
  const count = entry?.count ?? 0;
  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: entry ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0,
  };
}

/** Conta uma ocorrência e diz se ainda estava dentro do limite. */
export function hitRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  if (disabled()) return { allowed: true, remaining: limit, retryAfterSec: 0 };
  if (store.size > MAX_KEYS) {
    for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
    if (store.size > MAX_KEYS) store.clear(); // último recurso: nunca crescer sem limite
  }
  let entry = liveEntry(key, now);
  if (!entry) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}

export function clearRateLimits(): void {
  store.clear();
}

/** IP do cliente atrás de proxy (primeiro item de X-Forwarded-For); "unknown" se ausente. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

export function tooManyRequests(retryAfterSec: number, message = "Muitas tentativas. Aguarde e tente novamente."): Response {
  return Response.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

/** Conta uma ocorrência e devolve a resposta 429 pronta se estourou; null se pode seguir. */
export function rateLimitedResponse(key: string, limit: number, windowMs: number): Response | null {
  const result = hitRateLimit(key, limit, windowMs);
  return result.allowed ? null : tooManyRequests(result.retryAfterSec);
}

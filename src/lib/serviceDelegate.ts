/**
 * Chama um dos serviços internos (cache-updater, name-resolver) sobre a
 * rede do Docker; se a URL não estiver configurada (dev local, testes) ou a
 * chamada falhar/der timeout, retorna null e quem chamou cai pro caminho
 * local (as mesmas funções de src/lib/* de sempre) — mesmo princípio de
 * "cache-first, fallback ao vivo" que o projeto já usa, uma camada acima.
 *
 * Só loga aviso quando a URL ESTÁ configurada e a chamada falhou de
 * verdade — silencioso quando a URL nem existe (comportamento normal em dev
 * local/testes), senão um `docker compose` com URL errada nunca daria sinal
 * nenhum de que a divisão em serviços não está sendo exercitada.
 */
export async function callInternalService<T>(
  baseUrl: string | undefined,
  path: string,
  body: unknown,
  timeoutMs = 2000
): Promise<T | null> {
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`${path} respondeu ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (error) {
    console.warn(`[fallback] ${baseUrl}${path} indisponível, usando caminho local:`, error);
    return null;
  }
}

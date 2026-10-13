/**
 * As últimas obras que a pessoa abriu, guardadas só no navegador (nada vai para o servidor a não ser quando o Explorar
 * pede sugestões). Serve para quem não entrou ver, em "Novas histórias, outros tempos", algo ligado ao que acabou de ver.
 */
const KEY = "animehub:recent-works";
const MAX = 12;

export function readRecentWorks(): number[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n) && n > 0).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** A obra mais recente vem primeiro; abrir de novo apenas a traz para a frente. */
export function rememberRecentWork(anilistId: number): void {
  try {
    const next = [anilistId, ...readRecentWorks().filter((id) => id !== anilistId)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // sem armazenamento (janela privada, bloqueado): a sugestão só deixa de usar o histórico.
  }
}

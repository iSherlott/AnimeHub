/**
 * Compartilhada entre as 2 rotas que gravam PlatformLink — src/app/api/
 * anime/[id]/platform-links/route.ts (editor dedicado) e src/app/api/
 * anime/route.ts (campo opcional de plataforma ao adicionar da tela
 * Descobrir). A 1ª já validava (achado da 5ª rodada de auditoria, Epic
 * 18); a 2ª não, porque a checagem vivia local à 1ª rota em vez de
 * compartilhada — a mesma classe de "os 2 caminhos de escrita divergiram"
 * já vista no achado alto da 6ª rodada (achado real da 10ª rodada).
 */
export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

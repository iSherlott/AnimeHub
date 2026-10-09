import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rede de segurança de autorização (GAP-Q-02/TR-131): não existe middleware
 * central, então uma rota nova nasceria pública sem ninguém notar. Este teste
 * falha se um `route.ts` não chamar requireUser/requireAdmin/getCurrentUser
 * E não estiver na lista de rotas PÚBLICAS POR DESIGN abaixo — adicionar
 * uma rota aqui é uma decisão consciente, revisada no PR.
 */
const API_ROOT = path.join(process.cwd(), "src", "app", "api");

const PUBLIC_BY_DESIGN = new Set([
  "anilist/search/route.ts", // busca pública (com rate limit)
  "anilist/season/route.ts",
  "anime-threads/trending/route.ts",
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/me/route.ts",
  "auth/signup/route.ts",
  "calendar/route.ts",
  "catalog/ranking/route.ts",
  "catalog/route.ts",
  "feed/trending-posts/route.ts",
  "hashtags/[key]/route.ts", // página pública da hashtag (só metadados e contagem)
  "uploads/[...path]/route.ts", // serve arquivos já publicados
  "users/[id]/posts/route.ts", // perfil público
  "users/[id]/route.ts",
]);

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

describe("autorização das rotas de API", () => {
  const files = routeFiles(API_ROOT).map((f) => path.relative(API_ROOT, f).split(path.sep).join("/"));

  it("encontra as rotas (sanidade do teste)", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("toda rota autentica o chamador ou está na lista de públicas por design", () => {
    const unguarded = files.filter((rel) => {
      if (PUBLIC_BY_DESIGN.has(rel)) return false;
      const source = readFileSync(path.join(API_ROOT, rel), "utf8");
      return !/requireUser|requireAdmin|getCurrentUser/.test(source);
    });
    expect(unguarded).toEqual([]);
  });

  it("a lista de públicas não guarda rotas que não existem mais", () => {
    const missing = [...PUBLIC_BY_DESIGN].filter((rel) => !files.includes(rel));
    expect(missing).toEqual([]);
  });

  it("rotas administrativas usam requireAdmin", () => {
    const adminFiles = files.filter((rel) => rel.startsWith("admin/"));
    expect(adminFiles.length).toBeGreaterThan(0);
    const weak = adminFiles.filter((rel) => !/requireAdmin/.test(readFileSync(path.join(API_ROOT, rel), "utf8")));
    expect(weak).toEqual([]);
  });
});

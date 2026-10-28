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

// Sistema fechado (28/10): sem cadastro aberto e com a parte social só para quem entrou. Público fica só o catálogo
// (Explorar, Calendário, Temporada, página da obra) e o login.
const PUBLIC_BY_DESIGN = new Set([
  "anilist/search/route.ts", // busca pública (com rate limit)
  "anilist/season/route.ts",
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/me/route.ts",
  "calendar/route.ts",
  "catalog/facets/route.ts", // o que existe no catálogo (gêneros, anos, tipos) para montar os filtros do Explorar
  "catalog/preview/route.ts", // sinopse e gêneros de uma obra para a prévia (com limite por IP)
  "catalog/ranking/route.ts",
  "catalog/route.ts",
  "readings/route.ts", // kana/furigana do texto enviado (com limite por IP)
  "synopsis/route.ts", // sinopse traduzida do nosso catálogo (com limite por IP)
  "uploads/[...path]/route.ts", // serve arquivos já publicados
  "seasons/route.ts", // temporadas que têm anime (filtro público de temporada)
  "explore/route.ts", // fileiras do Explorar (leitura pública; personaliza se houver sessão)
]);

/** A parte social (Feed, publicações, perfis, recados, hashtags, comunidades, amigos, quiz): toda leitura pede login. */
const MEMBER_ONLY_PREFIXES = ["posts", "feed", "users", "hashtags", "communities", "anime-threads", "scraps", "testimonials", "friends", "albums", "quiz"];

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
      return !/requireUser|requireAdmin|requireStaff|getCurrentUser/.test(source);
    });
    expect(unguarded).toEqual([]);
  });

  it("a lista de públicas não guarda rotas que não existem mais", () => {
    const missing = [...PUBLIC_BY_DESIGN].filter((rel) => !files.includes(rel));
    expect(missing).toEqual([]);
  });

  // Fase 9: as rotas administrativas exigem papel da equipe — requireAdmin (só administrador) ou requireStaff(área).
  it("rotas administrativas exigem administrador ou a permissão da área", () => {
    const adminFiles = files.filter((rel) => rel.startsWith("admin/"));
    expect(adminFiles.length).toBeGreaterThan(0);
    const weak = adminFiles.filter((rel) => !/requireAdmin\(\)|requireStaff\("(catalog|moderation|admin)"\)/.test(readFileSync(path.join(API_ROOT, rel), "utf8")));
    expect(weak).toEqual([]);
  });

  it("a parte social exige login em toda leitura, logo no começo (não basta olhar a sessão nem barrar só um caso)", () => {
    const social = files.filter((rel) => MEMBER_ONLY_PREFIXES.some((p) => rel === `${p}/route.ts` || rel.startsWith(`${p}/`)));
    expect(social.length).toBeGreaterThan(20);
    const open = social.filter((rel) => {
      const source = readFileSync(path.join(API_ROOT, rel), "utf8");
      const start = source.indexOf("export async function GET");
      if (start < 0) return false;
      // As primeiras linhas do GET (a barreira vem antes de ler qualquer parâmetro): /api/posts barrava só "Seguindo".
      const head = source
        .slice(start)
        .split("\n")
        .slice(1)
        .filter((line) => line.trim() && !line.trim().startsWith("//"))
        .slice(0, 3)
        .join("\n");
      return !/requireUser\(\)|requireAdmin\(\)|requireStaff\(/.test(head);
    });
    expect(open).toEqual([]);
  });

  it("não existe cadastro aberto nem convite: contas só pelo administrador", () => {
    expect(files).not.toContain("auth/signup/route.ts");
    expect(files.some((rel) => rel.startsWith("admin/invites"))).toBe(false);
    const create = readFileSync(path.join(API_ROOT, "admin/users/route.ts"), "utf8");
    expect(/export async function POST[\s\S]*?requireAdmin\(\)/.test(create)).toBe(true);
    // A conta nasce MEMBER: o papel nunca vem do corpo da requisição.
    expect(create).toMatch(/role: "MEMBER"/);
    expect(create).not.toMatch(/body\??\.role/);
  });

  it("usuários e papéis são só do administrador", () => {
    const adminOnly = files.filter((rel) => rel.startsWith("admin/users"));
    expect(adminOnly.length).toBeGreaterThan(0);
    const leaking = adminOnly.filter((rel) => /requireStaff\("(catalog|moderation)"\)/.test(readFileSync(path.join(API_ROOT, rel), "utf8")));
    expect(leaking).toEqual([]);
  });
});

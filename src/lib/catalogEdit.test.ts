import { describe, expect, it, vi } from "vitest";
import type { AniListMedia } from "@/lib/anilist";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { validateEdit } = await import("@/lib/catalogEdit");
const { stripProtected } = await import("@/lib/workPropagation");
const { mergeCatalogFields } = await import("@/lib/anilistImport");

const version = "2026-10-24T10:00:00.000Z";

describe("validateEdit", () => {
  it("aceita campos válidos e normaliza gêneros, datas e textos", () => {
    const r = validateEdit({ expectedUpdatedAt: version, changes: { titleEnglish: "  Work  ", genres: ["Drama", "Drama", "Adventure"], startDate: "2026-10-05", episodes: 12 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.data).toEqual({ titleEnglish: "Work", genres: "Drama,Adventure", startDate: new Date("2026-10-05T00:00:00Z"), episodes: 12 });
    expect(r.value.protect).toBe(true);
  });

  it("recusa campo fora da lista, valor inválido e pedido sem versão, com mensagem por campo", () => {
    const r = validateEdit({ changes: { anilistId: 5, format: "SERIE", episodes: 0, startDate: "2026-02-31", coverImage: "javascript:alert(1)", genres: ["Inventado"], titleRomaji: "" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["anilistId", "coverImage", "episodes", "expectedUpdatedAt", "format", "genres", "startDate", "titleRomaji"].sort());
  });

  it("pedido vazio não passa; só desproteger passa", () => {
    expect(validateEdit({ expectedUpdatedAt: version, changes: {} }).ok).toBe(false);
    const r = validateEdit({ expectedUpdatedAt: version, changes: {}, unprotect: ["description", "naoExiste"] });
    expect(r.ok && r.value.unprotect).toEqual(["description"]);
  });
});

describe("campos protegidos (manualFields)", () => {
  it("stripProtected tira do patch só o que o admin corrigiu", () => {
    expect(stripProtected({ description: "fonte", episodes: 12 }, ["description"])).toEqual({ episodes: 12 });
    expect(stripProtected({ description: "fonte" }, [])).toEqual({ description: "fonte" });
  });

  it("o complemento da AniList não sobrescreve campo protegido, nem com sobrescrever", () => {
    const incoming = { id: 1, idMal: null, title: { romaji: "Obra", english: "Work", native: "作品" }, coverImage: { extraLarge: "https://img/c.jpg" }, bannerImage: null, description: "Da fonte.", episodes: 24, status: "RELEASING", season: "FALL", seasonYear: 2026, genres: [], averageScore: null, startDate: null, endDate: null, nextAiringEpisode: null, externalLinks: [] } as unknown as AniListMedia;
    const existing = { titleEnglish: null, titleNative: null, coverImage: null, bannerImage: null, description: "Corrigida à mão.", episodes: 12, status: null, season: null, genres: null, averageScore: null, startDate: null, endDate: null, seasonYear: 2025, malId: null, nextEpisodeNumber: null, nextEpisodeAt: null, manualFields: ["description", "episodes", "seasonYear"] };
    const { data } = mergeCatalogFields(existing, incoming, true);
    expect(data).not.toHaveProperty("description");
    expect(data).not.toHaveProperty("episodes");
    expect(data).not.toHaveProperty("seasonYear");
    expect(data).toMatchObject({ titleEnglish: "Work", status: "RELEASING" });
  });
});

import { describe, expect, it } from "vitest";
import { pickWinner } from "./weeklyVote";
import { rankStandings, workPoints } from "./seasonPoolTypes";
import { sanitizeTiers, tierListPostBody } from "./tierList";
import { parseThemes, themesUrl } from "./animeThemes";
import { parseCast } from "./workCast";
import { validateEvent } from "./animeEvents";

describe("anime da semana", () => {
  it("vence quem tem mais votos; empate fica com a primeira da lista; sem votos não há vencedor", () => {
    expect(pickWinner([{ workKey: "1", position: 0, votes: 2 }, { workKey: "2", position: 1, votes: 5 }])).toBe("2");
    expect(pickWinner([{ workKey: "1", position: 1, votes: 3 }, { workKey: "2", position: 0, votes: 3 }])).toBe("2");
    expect(pickWinner([{ workKey: "1", position: 0, votes: 0 }])).toBeNull();
  });
});

describe("bolão", () => {
  it("pontos = nota do site × 10 (só com votos) + 2 por pessoa que acompanha", () => {
    expect(workPoints(8.4, 3, 5)).toBe(94);
    expect(workPoints(5, 0, 2)).toBe(4);
  });

  it("o placar soma as obras de cada pessoa, do maior para o menor", () => {
    const points = new Map([["a", 50], ["b", 30], ["c", 10]]);
    const standings = rankStandings(
      [
        { userId: "u1", displayName: "Ana", workKey: "a" },
        { userId: "u2", displayName: "Beto", workKey: "b" },
        { userId: "u2", displayName: "Beto", workKey: "c" },
      ],
      points
    );
    expect(standings.map((s) => [s.displayName, s.points])).toEqual([["Ana", 50], ["Beto", 40]]);
  });
});

describe("tier list", () => {
  it("só obras da temporada da pessoa, sem repetir", () => {
    const tiers = sanitizeTiers({ S: ["1", "x", "1"], A: ["2", "1"], Z: ["3"] }, new Set(["1", "2", "3"]));
    expect(tiers).toEqual({ S: ["1"], A: ["2"], B: [], C: [], D: [] });
  });

  it("o texto publicado lista os tiers com obras e leva a #tierlist", () => {
    const body = tierListPostBody({ season: "FALL", year: 2026 }, { S: ["1"], A: [], B: ["2", "3"], C: [], D: [] }, (k) => `Obra ${k}`);
    expect(body).toBe("Minha tier list de Outono 2026\n\nS: Obra 1\nB: Obra 2, Obra 3\n\n#tierlist");
  });
});

describe("aberturas (AnimeThemes)", () => {
  it("lê tipo, número, música, artistas, episódios e o link de cada obra da AniList", () => {
    const json = {
      anime: [
        {
          slug: "frieren",
          resources: [{ site: "MyAnimeList", external_id: 1 }, { site: "AniList", external_id: 154587 }],
          animethemes: [
            { type: "OP", sequence: 1, slug: "OP1", song: { title: "Yuusha", artists: [{ name: "YOASOBI" }] }, animethemeentries: [{ episodes: "1-12", videos: [{ link: "https://v.animethemes.moe/x.webm" }] }] },
            { type: "IN", slug: "IN1" },
          ],
        },
        { slug: "sem-anilist", resources: [], animethemes: [{ type: "OP", slug: "OP1" }] },
      ],
    };
    expect(parseThemes(json)).toEqual([
      { anilistId: 154587, type: "OP", sequence: 1, slug: "OP1", title: "Yuusha", artists: "YOASOBI", episodes: "1-12", videoUrl: "https://v.animethemes.moe/x.webm", sourceUrl: "https://animethemes.moe/anime/frieren/OP1" },
    ]);
  });

  it("pede várias obras numa consulta, filtrando pela AniList", () => {
    const url = decodeURIComponent(themesUrl([1, 2]));
    expect(url).toContain("filter[site]=AniList");
    expect(url).toContain("filter[external_id]=1,2");
  });
});

describe("elenco (AniList)", () => {
  it("fica com principais e de apoio, cada um com o dublador japonês", () => {
    const cast = parseCast({
      Media: {
        characters: {
          edges: [
            { role: "MAIN", node: { id: 1, name: { full: "Frieren", native: "フリーレン" }, image: { large: "f.jpg" } }, voiceActors: [{ id: 9, name: { full: "Atsumi Tanezaki", native: "種﨑敦美" }, image: null }] },
            { role: "BACKGROUND", node: { id: 2, name: { full: "Aldeão", native: null }, image: null }, voiceActors: [] },
            { role: "SUPPORTING", node: { id: 3, name: { full: "Fern", native: null }, image: null }, voiceActors: [] },
          ],
        },
      },
    });
    expect(cast.map((c) => [c.character.name, c.role, c.voiceActor?.name ?? null])).toEqual([["Frieren", "MAIN", "Atsumi Tanezaki"], ["Fern", "SUPPORTING", null]]);
  });
});

describe("agenda de eventos", () => {
  it("pede nome e início; fim depois do começo; link só http(s)", () => {
    expect(validateEvent({ title: "", startsAt: "2026-12-01T10:00:00Z" })).toMatchObject({ ok: false });
    expect(validateEvent({ title: "CCXP", startsAt: "2026-12-04T10:00:00Z", endsAt: "2026-12-03T10:00:00Z" })).toMatchObject({ ok: false });
    expect(validateEvent({ title: "CCXP", startsAt: "2026-12-04T10:00:00Z", url: "javascript:alert(1)" })).toMatchObject({ ok: false });
    expect(validateEvent({ title: "CCXP", kind: "CONVENCAO", startsAt: "2026-12-04T10:00:00Z", url: "https://ccxp.com.br" })).toMatchObject({ ok: true, value: { title: "CCXP", kind: "CONVENCAO", url: "https://ccxp.com.br" } });
  });
});

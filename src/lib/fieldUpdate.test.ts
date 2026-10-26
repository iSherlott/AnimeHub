import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { cleanAnidbText, diffEntry, incomingFromAnidb, incomingFromKitsu, sourceOfJob } = await import("@/lib/fieldUpdate");

const kitsu = {
  kitsuId: 7442,
  canonicalTitle: "Attack on Titan",
  titles: { en: "Attack on Titan", en_jp: "Shingeki no Kyojin", ja_jp: "進撃の巨人" },
  synopsis: "Centuries ago…",
  episodeCount: 25,
  startDate: "2013-04-07",
  endDate: "2013-09-28",
  status: "finished",
  subtype: "TV",
  posterImage: "https://media.kitsu.app/poster.jpg",
  coverImage: "https://media.kitsu.app/cover.jpg",
};

describe("atualização seletiva pela Kitsu e pelo AniDB", () => {
  it("Kitsu: títulos, situação e formato no vocabulário do catálogo; o que não informa fica de fora", () => {
    const incoming = incomingFromKitsu(kitsu);
    expect(incoming).toMatchObject({ titleRomaji: "Shingeki no Kyojin", titleEnglish: "Attack on Titan", titleNative: "進撃の巨人", status: "FINISHED", format: "TV", episodes: "25", startDate: "2013-04-07", coverImage: "https://media.kitsu.app/poster.jpg", bannerImage: "https://media.kitsu.app/cover.jpg" });
    // Temporada e ano não saem da data; categorias da Kitsu não são gêneros; site oficial a Kitsu não tem.
    expect(incoming.season).toBeUndefined();
    expect(incoming.seasonYear).toBeUndefined();
    expect(incoming.genres).toBeUndefined();
    expect(incoming.officialSite).toBeUndefined();
    expect(incomingFromKitsu({ ...kitsu, status: "upcoming", subtype: "movie", episodeCount: null }).status).toBe("NOT_YET_RELEASED");
    expect(incomingFromKitsu({ ...kitsu, subtype: "desconhecido" }).format).toBeUndefined();
  });

  it("AniDB: título principal em romaji, oficiais em inglês e japonês, tipo, sinopse sem a marcação de links", () => {
    const incoming = incomingFromAnidb({
      anidbId: 9541,
      type: "TV Series",
      titles: [
        { language: "x-jat", title: "Shingeki no Kyojin", isOfficial: false },
        { language: "en", title: "Attack on Titan", isOfficial: true },
        { language: "en", title: "AoT", isOfficial: false },
        { language: "ja", title: "進撃の巨人", isOfficial: true },
      ],
      picture: "https://cdn.anidb.net/images/main/1.jpg",
      description: "http://anidb.net/ch1234 [Eren] lives behind walls.",
      startDate: "2013-04-07",
      endDate: null,
      episodeCount: 25,
      rating: null,
      ratingVotes: null,
      awards: [],
      resources: {},
      episodes: [],
    });
    expect(incoming).toMatchObject({ titleRomaji: "Shingeki no Kyojin", titleEnglish: "Attack on Titan", titleNative: "進撃の巨人", format: "TV", episodes: "25", startDate: "2013-04-07", coverImage: "https://cdn.anidb.net/images/main/1.jpg", description: "Eren lives behind walls." });
    expect(incoming.endDate).toBeUndefined();
    expect(incoming.status).toBeUndefined();
    expect(incoming.bannerImage).toBeUndefined();
  });

  it("limpa os links do AniDB e a fonte do lote vem do rótulo (lote antigo = AniList)", () => {
    expect(cleanAnidbText("https://anidb.net/cr55 [Studio X] e http://anidb.net/ch9 [Mikasa].")).toBe("Studio X e Mikasa.");
    expect(sourceOfJob("Kitsu")).toBe("kitsu");
    expect(sourceOfJob("AniDB")).toBe("anidb");
    expect(sourceOfJob("AniList")).toBe("anilist");
    expect(sourceOfJob(null)).toBe("anilist");
  });

  it("o diff só marca mudança onde a fonte trouxe valor (o que ela não informa não apaga)", () => {
    const entry = { titleRomaji: "Shingeki no Kyojin", titleEnglish: null, titleNative: null, description: "Antiga", genres: "Ação", format: "TV", status: "RELEASING", episodes: 25, season: "SPRING", seasonYear: 2013, startDate: null, endDate: null, coverImage: null, bannerImage: null, officialSite: null, manualFields: ["description"] };
    const diff = diffEntry(entry as never, incomingFromKitsu(kitsu));
    const by = Object.fromEntries(diff.map((d) => [d.field, d]));
    expect(by.status).toMatchObject({ changed: true, current: "RELEASING", incoming: "FINISHED" });
    expect(by.description).toMatchObject({ changed: true, protected: true });
    expect(by.genres).toMatchObject({ changed: false, missing: true, current: "Ação" });
    expect(by.season).toMatchObject({ changed: false, missing: true });
    expect(by.titleRomaji.changed).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { parseAnidbDay, parseAnidbGeneral, parseSeasonHtml } from "./parseSeasonHtml";

/** Recorte fiel da listagem de temporada do AniDB (arquivo "autumn 2026"). */
const ANIDB = `
<div class="g_bubblewrap g_bubble container">
  <div class="g_odd g_bubble box no1" id="a20414">
    <div class="thumb image">
      <a href="/anime/20414"><picture>
        <img loading="lazy" alt="Meitantei Conan: 30 Gou Satsujin Jiken" src="https://cdn.anidb.net/images/150/330015.jpg-thumb.jpg" height="212" width="150" class="g_image g_bubble small">
      </picture></a></div>
    <div class="data">
      <div class="wrap name"><div class="icons tooltip"><span class="i_icon i_info"></span></div><a class="name-colored" href="/anime/20414">Meitantei Conan: 30 Gou Satsujin Jiken</a>
      </div>
      <div class="icons actions"><a class="i_icon i_mylist_no" href="/anime/20414/?nonav=1"><span>add</span></a>
<a class="i_icon brand i_resource_crunchyroll" title="stream this content" href="https://www.crunchyroll.com/series/GMTE00390308/" data-anidb-rel="anidb::extern"><span>stream</span></a>
<a class="i_icon brand i_resource_amazon_video" href="https://www.amazon.com/dp/B0" data-anidb-rel="anidb::extern"><span>stream</span></a>
      </div>
      <div class="date">25th September
      </div>
      <div class="general">TV Special, 1 ep
      </div>
      <div class="desc">Conan &amp; the League visit the <b>Nagano</b> factory.
      </div>
    </div>
  </div>

  <div class="g_bubble box no2" id="a19724">
    <div class="thumb image"><a href="/anime/19724"><picture><img alt="x" src="https://cdn.anidb.net/images/150/1.jpg-thumb.jpg"></picture></a></div>
    <div class="data">
      <div class="wrap name"><a class="name-colored" href="/anime/19724">Kusuriya no Hitorigoto 3</a></div>
      <div class="date">3rd October</div>
      <div class="general">TV Series, 24 eps</div>
    </div>
  </div>

  <div class="g_odd g_bubble box no3" id="a19999">
    <div class="data">
      <div class="wrap name"><a class="name-colored" href="/anime/19999">Filme Teste</a></div>
      <div class="date">11th December</div>
      <div class="general">Movie, 1 ep</div>
    </div>
  </div>
</div>`;

const FALL_2026 = { season: "FALL", year: 2026 } as const;

describe("parseSeasonHtml · listagem de temporada do AniDB", () => {
  it("lê id, título, formato, episódios, sinopse, imagem e sites de streaming", () => {
    const { records, skipped } = parseSeasonHtml(ANIDB, { season: FALL_2026 });
    expect(skipped).toBe(0);
    expect(records.map((r) => r.sourceKey)).toEqual(["20414", "19724", "19999"]);
    expect(records[0]).toMatchObject({
      titleRomaji: "Meitantei Conan: 30 Gou Satsujin Jiken",
      format: "SPECIAL",
      episodes: 1,
      year: 2026,
      description: "Conan & the League visit the Nagano factory.",
      imageUrl: "https://cdn.anidb.net/images/150/330015.jpg-thumb.jpg",
      airsAtHasTime: false,
    });
    expect(records[0].links).toEqual([
      { site: "Crunchyroll", url: "https://www.crunchyroll.com/series/GMTE00390308/" },
      { site: "Amazon Prime Video", url: "https://www.amazon.com/dp/B0" },
    ]);
    expect(records[0].airsAt?.toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });

  it("não inventa o que a fonte não traz", () => {
    const [, tv, movie] = parseSeasonHtml(ANIDB, { season: FALL_2026 }).records;
    expect(tv).toMatchObject({ format: "TV", episodes: 24, description: null, links: [] });
    expect(movie).toMatchObject({ format: "MOVIE", episodes: 1 });
    expect(movie.airsAt?.toISOString()).toBe("2026-12-11T00:00:00.000Z");
  });

  it("ignora o contêiner e repetidos", () => {
    const html = ANIDB + ANIDB;
    const result = parseSeasonHtml(html, { season: FALL_2026 });
    expect(result.records).toHaveLength(3);
    expect(result.skipped).toBe(3);
  });

  it("lê todos os títulos de uma listagem grande, sem perder nenhum", () => {
    const many = Array.from({ length: 150 }, (_, i) => `<div class="g_bubble box no${i + 1}" id="a${30000 + i}"><div class="data"><div class="wrap name"><a class="name-colored" href="/anime/${30000 + i}">Titulo ${i}</a></div><div class="date">1st October</div><div class="general">TV Series</div></div></div>`).join("\n");
    const result = parseSeasonHtml(`<div class="g_bubblewrap g_bubble container">${many}</div>`, { season: FALL_2026 });
    expect(result.records).toHaveLength(150);
    expect(result.records.map((r) => r.sourceKey)).toEqual(Array.from({ length: 150 }, (_, i) => String(30000 + i)));
    expect(result.warnings).toEqual([]);
  });

  it("avisa quando um título do HTML não pôde ser lido (bloco sem identificador)", () => {
    const html = ANIDB + `<div class="g_bubble box no4"><div class="data"><div class="wrap name"><a class="name-colored" href="/anime/1">Sem Id Round</a></div></div></div>`;
    const result = parseSeasonHtml(html, { season: FALL_2026 });
    expect(result.records).toHaveLength(3);
    expect(result.warnings.join(" ")).toContain("4 títulos, mas só 3 foram lidos");
  });

  it("sem a temporada, o ano vem da própria data e só se ela o trouxer", () => {
    const { records } = parseSeasonHtml(ANIDB);
    expect(records[0].airsAt).toBeNull();
    expect(records[0].year).toBeNull();
  });
});

describe("parseAnidbDay", () => {
  it("usa o ano da temporada", () => {
    expect(parseAnidbDay("1st October", FALL_2026)?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("dezembro numa temporada de inverno pertence ao ano anterior", () => {
    expect(parseAnidbDay("28th December", { season: "WINTER", year: 2027 })?.toISOString()).toBe("2026-12-28T00:00:00.000Z");
    expect(parseAnidbDay("5th January", { season: "WINTER", year: 2027 })?.toISOString()).toBe("2027-01-05T00:00:00.000Z");
  });

  it("rejeita dia inexistente ou mês desconhecido", () => {
    expect(parseAnidbDay("31st February", FALL_2026)).toBeNull();
    expect(parseAnidbDay("5th Brumaire", FALL_2026)).toBeNull();
  });
});

describe("parseAnidbGeneral", () => {
  it.each([
    ["TV Series, 12 eps", "TV", 12],
    ["TV Series", "TV", null],
    ["Web, 5 eps", "ONA", 5],
    ["Movie, 1 ep", "MOVIE", 1],
    ["TV Special, 1 ep", "SPECIAL", 1],
    ["OVA, 2 eps", "OVA", 2],
    ["Mystery", null, null],
  ])("%s", (text, format, episodes) => {
    expect(parseAnidbGeneral(text)).toEqual({ format, episodes });
  });
});

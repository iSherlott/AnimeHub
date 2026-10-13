import { describe, expect, it } from "vitest";
import { detectSeason, detectYearFromTitles, fullImageUrl, parseAnidbDay, parseAnidbGeneral, parseAnidbTags, parseSeasonHtml, seasonMismatch, yearMismatch } from "./parseSeasonHtml";
import { inferStatus } from "./apply";

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
      imageUrl: "https://cdn.anidb.net/images/main/330015.jpg", // a miniatura de 150 px vira a imagem inteira
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


const TAGGED = `
<div class="g_bubblewrap g_bubble container">
  <div class="g_odd g_bubble box no1" id="a100">
    <div class="data">
      <div class="wrap name"><a class="name-colored" href="/anime/100">Comedia Escolar</a></div>
      <div class="date">5th July</div><div class="general">TV Series, 12 eps</div>
      <div class="tags"><span class="g_tag"><a class="tooltip" href="/tag/1"><span class="tagname">comedy</span><span class="wrapper"><span class="g_bubble text">humor</span></span></a></span>, <span class="g_tag"><a href="/tag/2"><span class="tagname">school life</span></a></span>, <span class="g_tag"><a href="/tag/3"><span class="tagname">manga</span></a></span>, <span class="g_tag"><a href="/tag/4"><span class="tagname">romance</span></a></span></div>
    </div>
  </div>
  <div class="g_bubble box no2" id="a200">
    <div class="data">
      <div class="wrap name"><a class="name-colored" href="/anime/200">Titulo Explicito</a></div>
      <div class="date">6th July</div><div class="general">TV Series, 12 eps</div>
      <div class="tags"><span class="g_tag"><a href="/tag/5"><span class="tagname">nudity</span></a></span>, <span class="g_tag"><a href="/tag/6"><span class="tagname">sex</span></a></span></div>
    </div>
  </div>
  <div class="g_odd g_bubble box no3" id="a300">
    <div class="data">
      <div class="wrap name"><a class="name-colored" href="/anime/300">Ecchi Comum</a></div>
      <div class="date">7th July</div><div class="general">TV Series, 12 eps</div>
      <div class="tags"><span class="g_tag"><a href="/tag/5"><span class="tagname">nudity</span></a></span></div>
    </div>
  </div>
</div>`;

describe("parseSeasonHtml · tags do AniDB", () => {
  const SUMMER_2026 = { season: "SUMMER", year: 2026 } as const;

  it("lê as tags, traduz para a taxonomia fechada e ignora o que não é gênero", () => {
    expect(parseAnidbTags('<span class="tagname">comedy</span><span class="tagname">Daily Life</span>')).toEqual(["comedy", "daily life"]);
    const [comedy] = parseSeasonHtml(TAGGED, { season: SUMMER_2026 }).records;
    expect(comedy.genres).toEqual(["Comedy", "Romance"]); // "school life" e "manga" não são gêneros da taxonomia
    expect(comedy.adult).toBe(false);
  });

  it("tag de sexo explícito marca o registro como adulto; nudez sozinha não", () => {
    const [, explicit, ecchi] = parseSeasonHtml(TAGGED, { season: SUMMER_2026 }).records;
    expect(explicit.adult).toBe(true);
    expect(ecchi.adult).toBe(false);
  });
});

describe("fullImageUrl", () => {
  it("troca a miniatura de 150 px do AniDB pela imagem inteira e mantém qualquer outra URL", () => {
    expect(fullImageUrl("https://cdn.anidb.net/images/150/326184.jpg-thumb.jpg")).toBe("https://cdn.anidb.net/images/main/326184.jpg");
    expect(fullImageUrl("https://cdn.anidb.net/images/main/1.jpg")).toBe("https://cdn.anidb.net/images/main/1.jpg");
    expect(fullImageUrl("https://s4.anilist.co/x.jpg")).toBe("https://s4.anilist.co/x.jpg");
  });
});

describe("inferStatus", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const day = (d: string) => new Date(`${d}T00:00:00Z`);
  it("o que ainda não estreou (ou não tem data) é NOT_YET_RELEASED", () => {
    expect(inferStatus({ format: "TV", episodes: 12, airsAt: day("2026-11-01") }, now)).toBe("NOT_YET_RELEASED");
    expect(inferStatus({ format: "TV", episodes: 12, airsAt: null }, now)).toBe("NOT_YET_RELEASED");
  });
  it("filme ou episódio único já exibido está finalizado", () => {
    expect(inferStatus({ format: "MOVIE", episodes: 1, airsAt: day("2026-09-01") }, now)).toBe("FINISHED");
    expect(inferStatus({ format: "OVA", episodes: 1, airsAt: day("2026-09-01") }, now)).toBe("FINISHED");
  });
  it("série cujas semanas já passaram está finalizada; a que ainda cabe no ar segue em exibição", () => {
    expect(inferStatus({ format: "TV", episodes: 12, airsAt: day("2026-07-05") }, now)).toBe("FINISHED"); // 12 semanas depois: out/12
    expect(inferStatus({ format: "TV", episodes: 24, airsAt: day("2026-07-05") }, now)).toBe("RELEASING");
    expect(inferStatus({ format: "ONA", episodes: null, airsAt: day("2026-07-05") }, now)).toBe("RELEASING");
  });
});

function boxesOn(days: string[]): string {
  return `<div class="g_bubblewrap g_bubble container">${days
    .map(
      (day, i) => `<div class="g_bubble box no${i}" id="a${500 + i}"><div class="data"><div class="wrap name"><a class="name-colored" href="/anime/${500 + i}">Obra ${i}</a></div><div class="date">${day}</div><div class="general">TV Series, 12 eps</div></div></div>`
    )
    .join("")}</div>`;
}

describe("temporada indicada pelas datas do HTML", () => {
  const spring = boxesOn(["2nd March", "13th March", "5th April", "12th April", "3rd May", "20th May", "1st June"]);
  const autumn = boxesOn(["1st October", "4th October", "10th October", "7th November", "5th December"]);

  it("detecta primavera e outono pelo mês mais comum", () => {
    expect(detectSeason(spring)).toBe("SPRING");
    expect(detectSeason(autumn)).toBe("FALL");
  });
  it("com poucas datas não arrisca um palpite", () => {
    expect(detectSeason(boxesOn(["1st April", "2nd April"]))).toBeNull();
  });
  it("recusa o rótulo errado: primavera analisada como outono", () => {
    expect(seasonMismatch(spring, { season: "FALL", year: 2026 })).toBe("SPRING");
    expect(seasonMismatch(spring, { season: "SPRING", year: 2026 })).toBeNull();
    expect(seasonMismatch(autumn, { season: "FALL", year: 2026 })).toBeNull();
  });
  it("aceita a folga de um mês nas pontas (março na primavera, dezembro no outono)", () => {
    expect(seasonMismatch(boxesOn(["2nd March", "9th March", "16th March", "5th April", "6th April"]), { season: "SPRING", year: 2026 })).toBeNull();
  });
});

function boxesTitled(titles: string[]): string {
  return `<div class="g_bubblewrap g_bubble container">${titles
    .map(
      (title, i) => `<div class="g_bubble box no${i}" id="a${700 + i}"><div class="data"><div class="wrap name"><a class="name-colored" href="/anime/${700 + i}">${title}</a></div><div class="date">${i + 1}th July</div><div class="general">TV Series, 12 eps</div></div></div>`
    )
    .join("")}</div>`;
}

describe("ano indicado pelos títulos do HTML", () => {
  const y2025 = boxesTitled(["A (2025)", "B (2025)", "C (2025)", "D (2025)", "E (2025)", "F (2025)", "Sem ano"]);

  it("lê o ano que domina nas marcas '(AAAA)' dos títulos", () => {
    expect(detectYearFromTitles(y2025)).toBe(2025);
  });
  it("com poucas marcas ou sem maioria não arrisca", () => {
    expect(detectYearFromTitles(boxesTitled(["A (2025)", "B (2025)", "C", "D", "E", "F"]))).toBeNull();
    expect(detectYearFromTitles(boxesTitled(["A (2025)", "B (2025)", "C (2025)", "D (2026)", "E (2026)", "F (2026)"]))).toBeNull();
  });
  it("recusa o ano errado: verão de 2025 escolhido como Summer2026", () => {
    expect(yearMismatch(y2025, { season: "SUMMER", year: 2026 })).toBe(2025);
    expect(yearMismatch(y2025, { season: "SUMMER", year: 2025 })).toBeNull();
  });
  it("o inverno aceita o ano anterior (estreias de dezembro)", () => {
    expect(yearMismatch(y2025, { season: "WINTER", year: 2026 })).toBeNull();
    expect(yearMismatch(y2025, { season: "WINTER", year: 2027 })).toBe(2025);
  });
});

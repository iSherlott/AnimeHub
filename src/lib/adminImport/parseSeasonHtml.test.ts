import { describe, expect, it } from "vitest";
import { decodeEntities, MAX_RECORDS, parseSeasonHtml, parseSourceDate } from "./parseSeasonHtml";

const SAMPLE = `
<section data-season="Autumn2026">
  <article data-anidb-id="19777" data-type="tv" data-year="2026" data-aired="2026-10-10T16:00:00Z">
    <h2>Yasei no Last Boss ga Arawareta!</h2>
    <p lang="ja">野生のラスボスが現れた！</p>
    <p lang="en">A Wild Last Boss &amp; Friends</p>
  </article>
  <article data-anidb-id="19001"><h2>Kusuriya no Hitorigoto 2</h2><time datetime="2026-10-11">11/10</time></article>
</section>`;

describe("parseSeasonHtml", () => {
  it("extracts ids, titles, type, year and source dates without inventing anything", () => {
    const result = parseSeasonHtml(SAMPLE);
    expect(result.seasonLabel).toBe("Autumn2026");
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      sourceKey: "19777",
      titleRomaji: "Yasei no Last Boss ga Arawareta!",
      titleNative: "野生のラスボスが現れた！",
      titleEnglish: "A Wild Last Boss & Friends",
      format: "TV",
      year: 2026,
      airsAtHasTime: true,
    });
    expect(result.records[0].airsAt?.toISOString()).toBe("2026-10-10T16:00:00.000Z");
    // Só o dia: sem horário e sem formato/ano inventados.
    expect(result.records[1]).toMatchObject({ sourceKey: "19001", titleNative: null, format: null, airsAtHasTime: false, year: 2026 });
  });

  it("never runs or keeps scripts, styles and comments", () => {
    const html = `<section><script>alert(1)</script><!-- <article data-anidb-id="1"><h2>Fantasma</h2></article> --><style>article{}</style>
      <article data-anidb-id="2"><h2><script>x()</script>Real</h2></article></section>`;
    const result = parseSeasonHtml(html);
    expect(result.records.map((r) => r.sourceKey)).toEqual(["2"]);
    expect(result.records[0].titleRomaji).toBe("Real");
  });

  it("skips records with bad ids, missing titles or duplicates and says why", () => {
    const html = `<article data-anidb-id="abc"><h2>Sem id</h2></article>
      <article data-anidb-id="5"></article>
      <article data-anidb-id="6"><h2>Ok</h2></article>
      <article data-anidb-id="6"><h2>Repetido</h2></article>`;
    const result = parseSeasonHtml(html);
    expect(result.records.map((r) => r.sourceKey)).toEqual(["6"]);
    expect(result.skipped).toBe(3);
    expect(result.warnings.length).toBe(3);
  });

  it("returns no records for text that is not a season list", () => {
    expect(parseSeasonHtml("<p>nada aqui</p>").records).toEqual([]);
    expect(parseSeasonHtml("").records).toEqual([]);
  });

  it("caps the number of records", () => {
    const html = Array.from({ length: MAX_RECORDS + 5 }, (_, i) => `<article data-anidb-id="${i + 1}"><h2>T${i}</h2></article>`).join("");
    const result = parseSeasonHtml(html);
    expect(result.records).toHaveLength(MAX_RECORDS);
    expect(result.warnings.some((w) => w.includes("Limite"))).toBe(true);
  });
});

describe("helpers", () => {
  it("decodes named and numeric entities and leaves unknown ones alone", () => {
    expect(decodeEntities("a &amp; b &#39;c&#39; &#x41; &foo;")).toBe("a & b 'c' A &foo;");
  });

  it("accepts only a day or a full ISO date-time", () => {
    expect(parseSourceDate("2026-10-11")).toMatchObject({ hasTime: false });
    expect(parseSourceDate("2026-10-11T13:00:00-03:00")).toMatchObject({ hasTime: true });
    expect(parseSourceDate("11/10/2026")).toBeNull();
    expect(parseSourceDate("2026-13-45")).toBeNull();
    expect(parseSourceDate(undefined)).toBeNull();
  });
});

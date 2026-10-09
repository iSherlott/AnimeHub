import { describe, expect, it } from "vitest";
import { canonicalHashtagKey, classifyHashtag, extractHashtags, splitBodyByHashtags } from "./hashtags";

describe("extractHashtags", () => {
  it("handles accents, kana/kanji and underscores (the examples the old ASCII regex broke)", () => {
    const keys = extractHashtags("Gostei de #Pokémon, #DireçãoDeArte e #ナルト #slice_of_life!").map((h) => h.key);
    expect(keys).toEqual(["pokémon", "direçãodearte", "ナルト", "slice_of_life"]);
  });

  it("collapses case differences into one canonical id and keeps the first display name", () => {
    const tags = extractHashtags("#AnimeFall2026 e depois #animefall2026 e #ANIMEFALL2026");
    expect(tags).toEqual([{ key: "animefall2026", display: "AnimeFall2026" }]);
  });

  it("ignores number-only tags, URL fragments and hashes glued to words", () => {
    expect(extractHashtags("lista #1 e #2026 e https://x.com/a#secao e abc#colado")).toEqual([]);
  });

  it("returns an empty list for text without hashtags", () => {
    expect(extractHashtags("sem tag nenhuma")).toEqual([]);
  });

  it("respects the maximum length", () => {
    expect(extractHashtags(`#${"a".repeat(41)}`)).toEqual([]);
    expect(extractHashtags(`#${"a".repeat(40)}`)).toHaveLength(1);
  });
});

describe("canonicalHashtagKey", () => {
  it("normalizes width and case (NFKC)", () => {
    expect(canonicalHashtagKey("ＡＢＣ")).toBe("abc");
  });
});

describe("classifyHashtag", () => {
  it("recognizes seasons, genres, works and falls back to topic", () => {
    expect(classifyHashtag("animefall2026")).toBe("SEASON");
    expect(classifyHashtag("fall2026")).toBe("SEASON");
    expect(classifyHashtag("mistério")).toBe("GENRE");
    expect(classifyHashtag("kusuriya", { workKeys: new Set(["kusuriya"]) })).toBe("WORK");
    expect(classifyHashtag("teorias")).toBe("TOPIC");
  });
});

describe("splitBodyByHashtags", () => {
  it("splits text and hashtags so the UI can render links without HTML", () => {
    const segments = splitBodyByHashtags("Olá #Pokémon, tudo bem? #ナルト");
    expect(segments.map((s) => s.type)).toEqual(["text", "hashtag", "text", "hashtag"]);
    expect(segments[1]).toEqual({ type: "hashtag", value: "#Pokémon", key: "pokémon" });
    expect(segments.map((s) => s.value).join("")).toBe("Olá #Pokémon, tudo bem? #ナルト");
  });

  it("returns the plain text untouched when there is no hashtag", () => {
    expect(splitBodyByHashtags("só texto")).toEqual([{ type: "text", value: "só texto" }]);
  });

  it("never turns '<script>' or markup into anything but text", () => {
    const segments = splitBodyByHashtags("<img src=x onerror=alert(1)> #ok");
    expect(segments[0]).toMatchObject({ type: "text" });
    expect(segments.map((s) => s.value).join("")).toBe("<img src=x onerror=alert(1)> #ok");
  });
});

import { describe, expect, it } from "vitest";
import { getStreamingLinks } from "./anilist";
import { isScheduledRunDue, planTargets } from "./episodeImages";
import { parseStreamingLinks } from "./production";

describe("planTargets", () => {
  it("groups the missing episodes by anime and skips the ones that already have an image", () => {
    const entries = [
      { anilistId: 20, episode: 3 },
      { anilistId: 10, episode: 2 },
      { anilistId: 10, episode: 1 },
      { anilistId: 10, episode: 2 },
      { anilistId: 30, episode: 5 },
    ];
    expect(planTargets(entries, new Set(["30-5"]))).toEqual([
      { anilistId: 10, episodes: [1, 2] },
      { anilistId: 20, episodes: [3] },
    ]);
  });

  it("plans nothing when everything already has an image", () => {
    expect(planTargets([{ anilistId: 1, episode: 1 }], new Set(["1-1"]))).toEqual([]);
  });
});

describe("isScheduledRunDue (00:00 America/Sao_Paulo)", () => {
  const tz = "America/Sao_Paulo";
  const now = new Date("2026-10-10T15:00:00Z"); // 12:00 em São Paulo

  it("is due when there was never a scheduled run", () => {
    expect(isScheduledRunDue(now, null, tz)).toBe(true);
  });

  it("is due when the last scheduled run was before today's midnight (also recovers a missed day)", () => {
    expect(isScheduledRunDue(now, new Date("2026-10-10T02:59:00Z"), tz)).toBe(true); // 23:59 de ontem
    expect(isScheduledRunDue(now, new Date("2026-10-08T03:00:00Z"), tz)).toBe(true);
  });

  it("is not due once a run happened since today's midnight", () => {
    expect(isScheduledRunDue(now, new Date("2026-10-10T03:00:05Z"), tz)).toBe(false); // 00:00:05
    expect(isScheduledRunDue(now, new Date("2026-10-10T14:00:00Z"), tz)).toBe(false);
  });
});

describe("streaming links", () => {
  it("keeps only enabled http(s) STREAMING links, one per site", () => {
    const links = getStreamingLinks({
      externalLinks: [
        { site: "Crunchyroll", url: "https://www.crunchyroll.com/series/x", type: "STREAMING" },
        { site: "crunchyroll", url: "https://www.crunchyroll.com/series/y", type: "STREAMING" },
        { site: "Netflix", url: "https://www.netflix.com/title/1", type: "STREAMING", isDisabled: true },
        { site: "Official Site", url: "https://example.com", type: "INFO" },
        { site: "Twitter", url: "https://twitter.com/x", type: "SOCIAL" },
        { site: "Hulu", url: "javascript:alert(1)", type: "STREAMING" },
        { site: "Amazon", url: null, type: "STREAMING" },
      ],
    });
    expect(links).toEqual([{ site: "Crunchyroll", url: "https://www.crunchyroll.com/series/x" }]);
  });

  it("parses the stored JSON defensively", () => {
    expect(parseStreamingLinks('[{"site":"A","url":"https://a.test"},{"site":"B","url":"ftp://b"},{"x":1}]')).toEqual([{ site: "A", url: "https://a.test" }]);
    expect(parseStreamingLinks(null)).toEqual([]);
    expect(parseStreamingLinks("not json")).toEqual([]);
    expect(parseStreamingLinks("{}")).toEqual([]);
  });
});

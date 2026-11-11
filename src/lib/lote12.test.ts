import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { extractMentions, splitMentions, MAX_MENTIONS_PER_TEXT } from "./mentionText";
import { parsePollInput } from "./postPollTypes";
import { parseMute } from "./mutes";
import { announcedFrom } from "./workAnnouncements";
import { compareRows } from "./listCompare";
import { seasonCharacterPostBody } from "./seasonCharacters";

describe("menções com @ (12/11)", () => {
  it("acha os @ válidos, sem e-mail, sem endereço, sem repetir e com limite", () => {
    expect(extractMentions("oi @Ana_R e @zeca! ana@site.com https://x.com/@nao @ana_r @ab")).toEqual(["ana_r", "zeca"]);
    expect(extractMentions(Array.from({ length: 8 }, (_, i) => `@pessoa${i}`).join(" "))).toHaveLength(MAX_MENTIONS_PER_TEXT);
  });
  it("quebra o texto em trechos e menções", () => {
    expect(splitMentions("valeu @Ana_R!")).toEqual([
      { type: "text", value: "valeu " },
      { type: "mention", value: "@Ana_R", handle: "ana_r" },
      { type: "text", value: "!" },
    ]);
  });
});

describe("enquete no Feed (12/11)", () => {
  it("2 a 4 opções, sem repetir, duração 1/3/7 dias ou sem prazo", () => {
    expect(parsePollInput(undefined)).toEqual({ ok: true, poll: null });
    expect(parsePollInput({ options: ["Sim", " Não ", ""], days: 3 })).toEqual({ ok: true, poll: { options: ["Sim", "Não"], days: 3 } });
    expect(parsePollInput({ options: ["Sim"] }).ok).toBe(false);
    expect(parsePollInput({ options: ["a", "b", "c", "d", "e"] }).ok).toBe(false);
    expect(parsePollInput({ options: ["Sim", "sim"] }).ok).toBe(false);
    expect(parsePollInput({ options: ["Sim", "Não"], days: 2 }).ok).toBe(false);
    expect(parsePollInput({ options: ["Sim", "Não"], days: null })).toEqual({ ok: true, poll: { options: ["Sim", "Não"], days: null } });
  });
});

describe("silenciar (12/11)", () => {
  it("obra pela chave da página, # pela chave canônica", () => {
    expect(parseMute({ kind: "WORK", key: "154001", label: "Frieren" })).toEqual({ kind: "WORK", key: "154001", label: "Frieren" });
    expect(parseMute({ kind: "WORK", key: "anidb-77" })).toMatchObject({ key: "anidb-77" });
    expect(parseMute({ kind: "WORK", key: "qualquer coisa" })).toBeNull();
    expect(parseMute({ kind: "TAG", key: "#Frieren" })).toMatchObject({ kind: "TAG", key: "frieren", label: "#frieren" });
    expect(parseMute({ kind: "OUTRO", key: "x" })).toBeNull();
  });
});

describe("anúncios de obras (12/11)", () => {
  it("continuação (PREQUEL) e filme/especial (PARENT) contam; o resto não", () => {
    const rel = JSON.stringify([
      { id: 1, relationType: "PREQUEL" },
      { id: 2, relationType: "PARENT" },
      { id: 3, relationType: "SEQUEL" },
      { id: 4, relationType: "CHARACTER" },
    ]);
    expect(announcedFrom(rel)).toEqual([1, 2]);
    expect(announcedFrom("não é json")).toEqual([]);
    expect(announcedFrom(null)).toEqual([]);
  });
});

describe("comparar listas (12/11)", () => {
  const row = (key: string, title: string, score: number | null) => ({ key, title, coverImage: null, href: null, score, genres: [] });
  it("em comum com as maiores diferenças primeiro; só de cada um em ordem alfabética", () => {
    const r = compareRows([row("a1", "Bravo", 9), row("a2", "Alfa", 5), row("a3", "Zeta", null)], [row("a1", "Bravo", 4), row("a2", "Alfa", 6), row("a4", "Delta", 7)]);
    expect(r.common.map((w) => [w.title, w.myScore, w.theirScore])).toEqual([["Bravo", 9, 4], ["Alfa", 5, 6]]);
    expect(r.onlyMine.map((w) => w.title)).toEqual(["Zeta"]);
    expect(r.onlyTheirs.map((w) => [w.title, w.theirScore])).toEqual([["Delta", 7]]);
  });
});

describe("personagem da temporada (12/11)", () => {
  it("o texto da publicação traz o primeiro, o pódio e as #", () => {
    const body = seasonCharacterPostBody(
      { season: "FALL", year: 2026 },
      [
        { characterId: 1, name: "Frieren", nativeName: null, image: null, favorites: 3, workKey: "1", workTitle: "Sousou no Frieren" },
        { characterId: 2, name: "Fern", nativeName: null, image: null, favorites: 1, workKey: "1", workTitle: "Sousou no Frieren" },
      ],
      "#frieren"
    );
    expect(body).toContain("🏆 Personagem da temporada · Outono 2026: Frieren, de Sousou no Frieren!");
    expect(body).toContain("2º Fern (Sousou no Frieren) — 1 favorito");
    expect(body).toContain("#personagemdatemporada #frieren");
  });
});

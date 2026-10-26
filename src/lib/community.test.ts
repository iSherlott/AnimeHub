import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { forumSearchWords, validateTopic } = await import("@/lib/community");

const works = [
  { id: "s1", anilistId: 1, titleRomaji: "Obra", titleNative: null, titleEnglish: null, kind: "EPISODE", format: "TV", seasonYear: 2020 },
  { id: "s2", anilistId: 2, titleRomaji: "Obra 2", titleNative: null, titleEnglish: null, kind: "EPISODE", format: "TV", seasonYear: 2022 },
];

describe("tópico da comunidade", () => {
  it("aceita título, mensagem, obra da franquia, spoiler e enquete (sem opções vazias)", () => {
    expect(validateTopic({ title: "  Teoria  ", body: " O final ", catalogEntryId: "s2", isSpoiler: true, poll: ["Sim", " Não ", ""] }, works)).toEqual({
      ok: true,
      value: { title: "Teoria", body: "O final", catalogEntryId: "s2", isSpoiler: true, poll: ["Sim", "Não"] },
    });
    expect(validateTopic({ title: "T", body: "M" }, works)).toMatchObject({ ok: true, value: { catalogEntryId: null, poll: null, isSpoiler: false } });
  });

  it("recusa título/mensagem vazios, obra de fora da franquia e enquete inválida", () => {
    const r = validateTopic({ title: " ", body: "", catalogEntryId: "outra", poll: ["Só uma"] }, works);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["body", "catalogEntryId", "poll", "title"]);
    expect(validateTopic({ title: "T", body: "M", poll: ["A", "a"] }, works)).toMatchObject({ ok: false, errors: { poll: "há opções repetidas" } });
    expect(validateTopic({ title: "T", body: "M", poll: Array.from({ length: 11 }, (_, i) => `O${i}`) }, works)).toMatchObject({ ok: false });
    expect(validateTopic({ title: "x".repeat(121), body: "M" }, works)).toMatchObject({ ok: false, errors: { title: "até 120 caracteres" } });
  });
});

describe("busca no fórum", () => {
  it("separa as palavras, ignora as de uma letra e repetidas, e limita a 6", () => {
    expect(forumSearchWords("  Abertura  a  ABERTURA final ")).toEqual(["abertura", "final"]);
    expect(forumSearchWords("um dois tres quatro cinco seis sete")).toHaveLength(6);
    expect(forumSearchWords(" a ")).toEqual([]);
  });
});

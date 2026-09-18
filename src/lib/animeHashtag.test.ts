import { describe, expect, it } from "vitest";
import {
  animeSlug,
  extractHashtagSlugs,
  findActiveHashtagQuery,
  insertHashtagSelection,
  resolveAnimeFromHashtags,
} from "@/lib/animeHashtag";

describe("animeSlug", () => {
  it("tira espaço, pontuação e acento, e passa pra minúsculo", () => {
    expect(animeSlug("Kaiju No. 8")).toBe("kaijuno8");
    expect(animeSlug("Re:Zero − Starting Life in Another World")).toBe("rezerostartinglifeinanotherworld");
  });

  it("é determinístico — mesma entrada, mesma saída", () => {
    expect(animeSlug("Jujutsu Kaisen")).toBe(animeSlug("Jujutsu Kaisen"));
  });
});

describe("extractHashtagSlugs", () => {
  it("acha todas as hashtags do texto, em minúsculo, na ordem", () => {
    expect(extractHashtagSlugs("Adorei o #KaijuNo8, melhor que #JujutsuKaisen")).toEqual([
      "kaijuno8",
      "jujutsukaisen",
    ]);
  });

  it("devolve lista vazia sem hashtag nenhuma", () => {
    expect(extractHashtagSlugs("post sem nenhuma marcação")).toEqual([]);
  });
});

describe("resolveAnimeFromHashtags", () => {
  const myAnime = [
    { id: "a1", titleRomaji: "Kaiju No. 8" },
    { id: "a2", titleRomaji: "Jujutsu Kaisen" },
  ];

  it("resolve pelo 1º hashtag que bate com um anime da lista", () => {
    expect(resolveAnimeFromHashtags("Adorei #JujutsuKaisen hoje", myAnime)).toEqual(myAnime[1]);
  });

  it("ignora hashtag que não bate com nada, resolve pela próxima que bater", () => {
    expect(resolveAnimeFromHashtags("#SemEssaAnime mas #KaijuNo8 sim", myAnime)).toEqual(myAnime[0]);
  });

  it("devolve null sem nenhuma hashtag que bata", () => {
    expect(resolveAnimeFromHashtags("#NadaAqui bate com a lista", myAnime)).toBeNull();
  });

  it("devolve null sem hashtag nenhuma no texto", () => {
    expect(resolveAnimeFromHashtags("texto qualquer sem marcação", myAnime)).toBeNull();
  });
});

describe("findActiveHashtagQuery", () => {
  it("acha a hashtag em digitação logo antes do cursor", () => {
    const body = "oi #kai";
    expect(findActiveHashtagQuery(body, body.length)).toBe("kai");
  });

  it("devolve string vazia logo depois de digitar só '#'", () => {
    const body = "oi #";
    expect(findActiveHashtagQuery(body, body.length)).toBe("");
  });

  it("devolve null quando não há '#' imediatamente antes (espaço no meio)", () => {
    expect(findActiveHashtagQuery("oi #kai mundo", 13)).toBeNull();
  });

  it("devolve null sem nenhum '#' no texto", () => {
    expect(findActiveHashtagQuery("oi mundo", 8)).toBeNull();
  });

  it("considera só até a posição do cursor, não o texto inteiro", () => {
    // cursor logo depois de "#ka", mesmo tendo mais texto depois
    expect(findActiveHashtagQuery("oi #kaiju mais texto", 6)).toBe("ka");
  });
});

describe("insertHashtagSelection", () => {
  it("troca a hashtag em digitação pelo slug completo + espaço, e devolve o cursor logo depois", () => {
    const body = "oi #kai";
    const result = insertHashtagSelection(body, body.length, "kaijuno8");
    expect(result.body).toBe("oi #kaijuno8 ");
    expect(result.cursorPos).toBe(result.body.length);
  });

  it("preserva o texto depois do cursor", () => {
    const body = "oi #kai tudo bem?";
    const cursorPos = "oi #kai".length;
    const result = insertHashtagSelection(body, cursorPos, "kaijuno8");
    expect(result.body).toBe("oi #kaijuno8  tudo bem?");
  });

  it("não muda nada se não há hashtag ativa na posição do cursor", () => {
    const body = "oi mundo";
    const result = insertHashtagSelection(body, body.length, "kaijuno8");
    expect(result).toEqual({ body, cursorPos: body.length });
  });
});

import { describe, expect, it } from "vitest";
import { letterToIndex, parseQuizImport } from "./quizImport";

const question = (i: number, over: Record<string, unknown> = {}) => ({
  category: "personagens",
  text: `Pergunta ${i}?`,
  options: ["Alfa", "Beta", "Gama", "Delta"],
  correct: "b",
  ...over,
});
const quiz = (over: Record<string, unknown> = {}) => ({
  anilistId: 154587,
  scope: "Season 1 — personagens",
  titleReward: "Olhar de boticária",
  questions: Array.from({ length: 10 }, (_, i) => question(i + 1)),
  ...over,
});

describe("parseQuizImport · JSON", () => {
  it("aceita um quiz completo e normaliza categoria (caixa alta) e a correta (A–D → 0–3)", () => {
    const result = parseQuizImport(JSON.stringify(quiz()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quizzes).toHaveLength(1);
    expect(result.quizzes[0].questions[0]).toEqual({ category: "PERSONAGENS", text: "Pergunta 1?", options: ["Alfa", "Beta", "Gama", "Delta"], correct: 1 });
  });

  it("aceita uma lista com vários animes de uma vez", () => {
    const result = parseQuizImport(JSON.stringify([quiz(), quiz({ anilistId: 2 })]));
    expect(result.ok && result.quizzes.map((q) => q.anilistId)).toEqual([154587, 2]);
  });

  it("exige exatamente 10 perguntas", () => {
    const result = parseQuizImport(JSON.stringify(quiz({ questions: [question(1)] })));
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.errors.join(" ")).toContain("exatamente 10 perguntas, vieram 1");
  });

  it("reporta todos os problemas de uma vez, com a pergunta de cada um", () => {
    const bad = quiz({
      questions: [
        question(1, { options: ["a", "b", "c"] }),
        question(2, { correct: "E" }),
        question(3, { options: ["x", "x", "y", "z"] }),
        question(4, { text: "" }),
        ...Array.from({ length: 6 }, (_, i) => question(i + 5)),
      ],
    });
    const result = parseQuizImport(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    const errors = !result.ok ? result.errors.join("\n") : "";
    expect(errors).toContain("pergunta 1: são necessárias exatamente 4 alternativas");
    expect(errors).toContain("pergunta 2: a alternativa correta deve ser A, B, C ou D");
    expect(errors).toContain("pergunta 3: há alternativas repetidas");
    expect(errors).toContain("pergunta 4: falta o enunciado");
  });

  it("recusa enunciados repetidos, campos obrigatórios ausentes e ids duplicados no envio", () => {
    expect(parseQuizImport(JSON.stringify(quiz({ questions: Array.from({ length: 10 }, () => question(1)) })))).toMatchObject({ ok: false });
    const noMeta = parseQuizImport(JSON.stringify(quiz({ scope: "", titleReward: "", anilistId: 0 })));
    const text = !noMeta.ok ? noMeta.errors.join(" ") : "";
    expect(text).toContain("falta o id da AniList");
    expect(text).toContain("falta o escopo");
    expect(text).toContain("falta o título da recompensa");
    const dup = parseQuizImport(JSON.stringify([quiz(), quiz()]));
    expect(!dup.ok && dup.errors.join(" ")).toContain("mesma obra no mesmo envio");
  });

  it("JSON quebrado e texto vazio viram mensagens claras", () => {
    expect(parseQuizImport("{ quebrado")).toMatchObject({ ok: false });
    expect(parseQuizImport("   ")).toEqual({ ok: false, errors: ["Cole o JSON ou o CSV das perguntas para carregar."] });
  });
});

describe("parseQuizImport · CSV", () => {
  const rows = Array.from({ length: 10 }, (_, i) => `Personagens;Pergunta ${i + 1}?;Alfa;Beta;Gama;Delta;C`).join("\n");

  it("lê um anime com os padrões do formulário, ignorando cabeçalho e comentários", () => {
    const csv = `categoria;pergunta;A;B;C;D;correta\n# comentário\n${rows}`;
    const result = parseQuizImport(csv, { anilistId: 7, scope: "Escopo", titleReward: "Título" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quizzes[0]).toMatchObject({ anilistId: 7, scope: "Escopo", titleReward: "Título" });
    expect(result.quizzes[0].questions[0]).toMatchObject({ category: "PERSONAGENS", correct: 2 });
  });

  it("pede o id/escopo/título quando o CSV não os traz", () => {
    const result = parseQuizImport(rows);
    expect(!result.ok && result.errors.join(" ")).toContain("falta o id da AniList");
  });

  it("aceita TAB como separador", () => {
    const tabs = rows.replace(/;/g, "\t");
    expect(parseQuizImport(tabs, { anilistId: 7, scope: "E", titleReward: "T" }).ok).toBe(true);
  });
});

describe("letterToIndex", () => {
  it("converte A–D em qualquer caixa e rejeita o resto", () => {
    expect([letterToIndex("a"), letterToIndex(" D "), letterToIndex("E"), letterToIndex(2), letterToIndex(undefined)]).toEqual([0, 3, null, null, null]);
  });
});

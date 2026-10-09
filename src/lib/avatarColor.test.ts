import { describe, expect, it } from "vitest";
import { readableTextColor } from "./avatarColor";

describe("readableTextColor", () => {
  it("usa texto escuro em fundos claros (âmbar, ciano)", () => {
    expect(readableTextColor("#ffab00")).toBe("#0b0b0d");
    expect(readableTextColor("#00bfa5")).toBe("#0b0b0d");
  });

  it("usa texto branco em fundos escuros", () => {
    expect(readableTextColor("#311b92")).toBe("#ffffff");
    expect(readableTextColor("#0b0b0d")).toBe("#ffffff");
  });
});

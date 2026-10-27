import { describe, expect, it } from "vitest";
import { formatBirthday, upcomingBirthdayKeys, validateBirthday } from "./birthdayDates";

describe("validateBirthday", () => {
  it("aceita dia e mês válidos (29/02 inclusive) e limpa com os dois vazios", () => {
    expect(validateBirthday(14, 3)).toEqual({ ok: true, value: { birthDay: 14, birthMonth: 3 } });
    expect(validateBirthday("29", "2")).toEqual({ ok: true, value: { birthDay: 29, birthMonth: 2 } });
    expect(validateBirthday(null, null)).toEqual({ ok: true, value: { birthDay: null, birthMonth: null } });
  });

  it("recusa data impossível ou só um dos dois", () => {
    expect(validateBirthday(31, 4).ok).toBe(false);
    expect(validateBirthday(30, 2).ok).toBe(false);
    expect(validateBirthday(10, null).ok).toBe(false);
    expect(validateBirthday(0, 1).ok).toBe(false);
    expect(validateBirthday(1, 13).ok).toBe(false);
    expect(validateBirthday(1.5, 1).ok).toBe(false);
  });
});

describe("upcomingBirthdayKeys", () => {
  it("conta os dias no fuso de quem vê, virando o mês", () => {
    // 02:00 UTC de 31/10 ainda é 30/10 em São Paulo.
    const keys = upcomingBirthdayKeys(new Date("2026-10-31T02:00:00Z"), "America/Sao_Paulo", 3);
    expect(keys).toEqual([
      { day: 30, month: 10, inDays: 0 },
      { day: 31, month: 10, inDays: 1 },
      { day: 1, month: 11, inDays: 2 },
    ]);
  });

  it("em 28/02 de ano não bissexto, quem nasceu em 29/02 também faz aniversário", () => {
    const keys = upcomingBirthdayKeys(new Date("2027-02-28T15:00:00Z"), "America/Sao_Paulo", 2);
    expect(keys).toContainEqual({ day: 29, month: 2, inDays: 0 });
    expect(keys).toContainEqual({ day: 1, month: 3, inDays: 1 });
    const leap = upcomingBirthdayKeys(new Date("2028-02-28T15:00:00Z"), "America/Sao_Paulo", 1);
    expect(leap).toEqual([{ day: 28, month: 2, inDays: 0 }]);
  });
});

it("formatBirthday", () => {
  expect(formatBirthday(14, 3)).toBe("14 de março");
});

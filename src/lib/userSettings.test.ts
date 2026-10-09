import { describe, expect, it } from "vitest";
import { SOCIAL_OFF_PATCH, validateSettingsPatch } from "./userSettings";

describe("validateSettingsPatch", () => {
  it("accepts valid title format, time zone and toggles", () => {
    const r = validateSettingsPatch({ titleFormat: "romaji", timeZone: "Asia/Tokyo", notifyLikes: true });
    expect(r).toEqual({ ok: true, patch: { titleFormat: "romaji", timeZone: "Asia/Tokyo", notifyLikes: true } });
  });

  it("accepts null (back to product default) and the device option", () => {
    expect(validateSettingsPatch({ titleFormat: null, timeZone: "device" })).toEqual({
      ok: true,
      patch: { titleFormat: null, timeZone: "device" },
    });
  });

  it.each([
    [{ titleFormat: "klingon" }],
    [{ timeZone: "Mars/Olympus" }],
    [{ notifyReleases: "yes" }],
    [{}],
    [null],
    [[]],
    ["x"],
  ])("rejects %j", (body) => {
    expect(validateSettingsPatch(body).ok).toBe(false);
  });

  it("ignores unknown keys instead of persisting them", () => {
    const r = validateSettingsPatch({ notifyLikes: false, role: "ADMIN" });
    expect(r).toEqual({ ok: true, patch: { notifyLikes: false } });
  });
});

describe("SOCIAL_OFF_PATCH", () => {
  it("never touches the release channel", () => {
    expect(SOCIAL_OFF_PATCH).not.toHaveProperty("notifyReleases");
    expect(Object.values(SOCIAL_OFF_PATCH).every((v) => v === false)).toBe(true);
  });
});

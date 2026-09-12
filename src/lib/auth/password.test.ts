import { describe, it, expect } from "vitest";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/auth/password";

describe("hashPassword / verifyPassword", () => {
  it("produces a hash and salt that later verify successfully", async () => {
    const { hash, salt } = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("correct horse battery staple", hash, salt)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const { hash, salt } = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("wrong password", hash, salt)).toBe(false);
  });

  it("never stores the password in plain text in the hash or salt", async () => {
    const password = "correct horse battery staple";
    const { hash, salt } = await hashPassword(password);

    expect(hash).not.toContain(password);
    expect(salt).not.toContain(password);
  });

  it("produces a different salt (and therefore hash) for the same password each time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");

    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("does not verify a password against a hash/salt pair generated for a different password", async () => {
    const { hash, salt } = await hashPassword("password one");

    expect(await verifyPassword("password one", hash, salt)).toBe(true);
    const other = await hashPassword("password two");
    expect(await verifyPassword("password one", other.hash, other.salt)).toBe(false);
  });

  // DUMMY_HASH exists purely so the login route can spend the same scrypt
  // time whether or not the e-mail exists — it must never validate any real
  // password, and its hash must decode to the same byte length as a real
  // one so verifyPassword takes the same code path (not an early length
  // mismatch return) either way.
  describe("DUMMY_HASH", () => {
    it("never validates against any real password", async () => {
      expect(await verifyPassword("password", DUMMY_HASH.hash, DUMMY_HASH.salt)).toBe(false);
      expect(await verifyPassword("", DUMMY_HASH.hash, DUMMY_HASH.salt)).toBe(false);
    });

    it("decodes to the same key length as a real hash", async () => {
      const real = await hashPassword("some password");
      expect(Buffer.from(DUMMY_HASH.hash, "hex").length).toBe(
        Buffer.from(real.hash, "hex").length
      );
    });
  });
});

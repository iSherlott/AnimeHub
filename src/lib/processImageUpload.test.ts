import { afterAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { processImageUpload } from "./processImageUpload";
import { UPLOAD_STORAGE_ROOT } from "./uploadStorage";

const KIND = "unit-test-processImageUpload";
const request = new Request("http://localhost:3000/api/uploads");

afterAll(async () => {
  await rm(path.join(UPLOAD_STORAGE_ROOT, KIND), { recursive: true, force: true });
});

async function png(width: number, height: number): Promise<File> {
  const data = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 20, b: 60 } },
  })
    .png()
    .toBuffer();
  return new File([new Uint8Array(data)], "x.png", { type: "image/png" });
}

describe("processImageUpload", () => {
  it("reencodes to WebP, shrinks to maxDimension and returns a URL under the kind folder", async () => {
    const result = await processImageUpload(await png(1000, 500), request, { kind: KIND, maxDimension: 256 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(256);
    expect(result.url.startsWith(`http://localhost:3000/api/uploads/${KIND}/`)).toBe(true);
    expect(result.url.endsWith(".webp")).toBe(true);
  });

  it("does not enlarge small images", async () => {
    const result = await processImageUpload(await png(64, 64), request, { kind: KIND, maxDimension: 512 });
    expect(result.ok && result.width).toBe(64);
  });

  it("rejects content that is not an image (even with an image mime type)", async () => {
    const fake = new File([new TextEncoder().encode("<script>alert(1)</script>")], "x.png", { type: "image/png" });
    const result = await processImageUpload(fake, request, { kind: KIND, maxDimension: 256 });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects files above the size limit before decoding", async () => {
    const big = new File([new Uint8Array(9 * 1024 * 1024)], "x.png", { type: "image/png" });
    const result = await processImageUpload(big, request, { kind: KIND, maxDimension: 256 });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(!result.ok && result.error).toContain("muito grande");
  });
});

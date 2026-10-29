import { describe, expect, it } from "vitest";
import { fitsBackground, fitsBanner, parseImageSize } from "@/lib/imageSize";

const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

describe("parseImageSize (só o cabeçalho do arquivo)", () => {
  it("PNG", () => {
    const png = bytes([0x89], ascii("PNG\r\n\x1a\n"), u32be(13), ascii("IHDR"), u32be(1900), u32be(1069));
    expect(parseImageSize(png)).toEqual({ width: 1900, height: 1069 });
  });

  it("JPEG: pula os blocos até o SOF", () => {
    const app0 = [0xff, 0xe0, ...u16be(16), ...new Array(14).fill(0)];
    const sof = [0xff, 0xc0, ...u16be(17), 8, ...u16be(400), ...u16be(1900), 3, ...new Array(9).fill(0)];
    expect(parseImageSize(bytes([0xff, 0xd8], app0, sof))).toEqual({ width: 1900, height: 400 });
  });

  it("GIF e WebP (VP8, VP8L e VP8X)", () => {
    expect(parseImageSize(bytes(ascii("GIF89a"), u16le(640), u16le(360)))).toEqual({ width: 640, height: 360 });
    const riff = (chunk: string, body: number[]) => bytes(ascii("RIFF"), [0, 0, 0, 0], ascii("WEBP"), ascii(chunk), [0, 0, 0, 0], body);
    expect(parseImageSize(riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(1920), ...u16le(1080)]))).toEqual({ width: 1920, height: 1080 });
    const bits = (1920 - 1) | ((1080 - 1) << 14);
    expect(parseImageSize(riff("VP8L", [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff, 0, 0, 0, 0, 0]))).toEqual({ width: 1920, height: 1080 });
    expect(parseImageSize(riff("VP8X", [0, 0, 0, 0, 0x7f, 0x07, 0x00, 0x37, 0x04, 0x00]))).toEqual({ width: 1920, height: 1080 });
  });

  it("formato desconhecido ou arquivo cortado", () => {
    expect(parseImageSize(bytes(ascii("<html>")))).toBeNull();
    expect(parseImageSize(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
  });
});

describe("Full HD para o banner e o plano de fundo", () => {
  it("banner: 1900 px ou mais e faixa larga (3 por 1)", () => {
    expect(fitsBanner({ width: 1900, height: 400 })).toBe(true);
    expect(fitsBanner({ width: 1900, height: 600 })).toBe(true);
    expect(fitsBanner({ width: 1280, height: 269 })).toBe(false); // pequena
    expect(fitsBanner({ width: 1900, height: 1069 })).toBe(false); // tela cheia: é fundo, não faixa
    expect(fitsBanner(undefined)).toBe(false); // ainda não medida
  });

  it("plano de fundo: tela cheia de 1900×1000 ou mais", () => {
    expect(fitsBackground({ width: 1900, height: 1069 })).toBe(true);
    expect(fitsBackground({ width: 2560, height: 1920 })).toBe(true);
    expect(fitsBackground({ width: 1900, height: 400 })).toBe(false);
    expect(fitsBackground({ width: 460, height: 650 })).toBe(false); // capa
    expect(fitsBackground(undefined)).toBe(false);
  });
});

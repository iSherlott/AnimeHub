import { describe, expect, it } from "vitest";
import { pageOfOptions, workImages, type AvatarGroup } from "@/lib/avatarOptions";

const IMG = (name: string) => `https://s4.anilist.co/file/${name}.png`;
const cast = (people: Array<[string, string]>) => JSON.stringify(people.map(([name, image]) => ({ name, image: IMG(image) })));

describe("workImages (uma obra com todas as temporadas)", () => {
  it("junta as temporadas sem repetir endereço nem personagem; fica a arte da temporada mais recente", () => {
    const taken = new Set<string>();
    const { avatars, wide } = workImages(
      [
        { seasonNumber: 1, coverImage: IMG("capa-1"), bannerImage: null, castJson: cast([["Yuji", "yuji-1"], ["Megumi", "megumi"]]) },
        { seasonNumber: 2, coverImage: IMG("capa-2"), bannerImage: IMG("banner-2"), castJson: cast([["Yuji", "yuji-2"], ["Megumi", "megumi"], ["Nobara", "nobara"]]) },
      ],
      taken
    );
    expect(avatars.map((a) => a.label)).toEqual(["Capa", "Capa · 2ª temporada", "Yuji", "Megumi", "Nobara"]);
    expect(avatars.find((a) => a.label === "Yuji")?.url).toBe(IMG("yuji-2"));
    // Imagens largas: só o banner (a capa de 460 px fica no avatar; o tamanho decide entre banner e fundo depois).
    expect(wide.map((b) => b.label)).toEqual(["Banner · 2ª temporada"]);
    expect(taken.has(IMG("megumi"))).toBe(true);
  });

  it("uma temporada só não ganha o rótulo de temporada", () => {
    const { avatars } = workImages([{ seasonNumber: 1, coverImage: IMG("capa"), bannerImage: null, castJson: null }], new Set());
    expect(avatars).toEqual([{ url: IMG("capa"), label: "Capa" }]);
  });

  it("um endereço já usado por outra obra não volta", () => {
    const taken = new Set([IMG("compartilhada")]);
    const { avatars } = workImages([{ seasonNumber: 1, coverImage: IMG("compartilhada"), bannerImage: null, castJson: cast([["Ana", "ana"]]) }], taken);
    expect(avatars.map((a) => a.url)).toEqual([IMG("ana")]);
  });
});

describe("pageOfOptions", () => {
  const group = (n: number, title: string, avatars = 1): AvatarGroup => ({ key: String(n), anilistId: n, titleRomaji: title, titleEnglish: null, titleNative: null, avatars: Array.from({ length: avatars }, (_, i) => ({ url: IMG(`${n}-${i}`), label: "Capa" })), banners: [], backgrounds: [] });
  const groups = Array.from({ length: 19 }, (_, i) => group(i + 1, `Obra ${i + 1}`)).concat(group(99, "Shíngeki", 1), group(100, "Sem avatar", 0));

  it("páginas de 8 obras, só as que têm imagem do tipo pedido", () => {
    const first = pageOfOptions(groups, "avatar", "", 0);
    expect(first).toMatchObject({ total: 20, page: 0, pages: 3 });
    expect(first.groups).toHaveLength(8);
    expect(pageOfOptions(groups, "avatar", "", 2).groups).toHaveLength(4);
    expect(pageOfOptions(groups, "avatar", "", 9).page).toBe(2); // página além do fim vira a última
    expect(pageOfOptions(groups, "banner", "", 0)).toMatchObject({ total: 0, pages: 1 });
  });

  it("busca pelo título sem acento nem caixa", () => {
    expect(pageOfOptions(groups, "avatar", "SHINGEKI", 0).groups.map((g) => g.anilistId)).toEqual([99]);
  });
});

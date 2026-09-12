import type Kuroshiro from "kuroshiro";

// Lazy singleton — o dicionário do kuromoji é pesado (~15MB) então só
// carregamos uma vez por processo, na primeira vez que alguém pedir furigana.
let kuroshiroInstance: Kuroshiro | null = null;
let initPromise: Promise<Kuroshiro> | null = null;

async function getKuroshiro() {
  if (kuroshiroInstance) return kuroshiroInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const { default: Kuroshiro } = await import("kuroshiro");
      const { default: KuromojiAnalyzer } = await import(
        "kuroshiro-analyzer-kuromoji"
      );
      const instance = new Kuroshiro();
      await instance.init(new KuromojiAnalyzer());
      kuroshiroInstance = instance;
      return instance;
    })();
  }
  return initPromise;
}

/**
 * Converte um título japonês (kanji/kana) em HTML com <ruby>/<rt> (furigana
 * em hiragana sobre os kanji). Gerado a partir do próprio título vindo da
 * AniList/Kitsu — não é entrada de usuário, então é seguro renderizar como
 * HTML confiável.
 */
export async function toFuriganaHtml(text: string): Promise<string> {
  const kuroshiro = await getKuroshiro();
  return kuroshiro.convert(text, { to: "hiragana", mode: "furigana" });
}

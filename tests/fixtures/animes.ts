/**
 * Animes reais que o usuário acompanha na Crunchyroll, usados como massa de
 * teste. anilistId usa uma faixa alta (900000+) que nunca colide com IDs
 * reais da AniList — não fazemos nenhuma chamada à API neles.
 */
export type AnimeFixture = {
  anilistId: number;
  titleRomaji: string;
  crunchyrollUrl: string;
};

export const ANIME_FIXTURES: AnimeFixture[] = [
  {
    anilistId: 900001,
    titleRomaji:
      "The 100 Girlfriends Who Really Really Really Really Really Love You",
    crunchyrollUrl:
      "https://www.crunchyroll.com/pt-br/series/GNVHKN933/the-100-girlfriends-who-really-really-really-really-really-love-you",
  },
  {
    anilistId: 900002,
    titleRomaji: "Kaiju No. 8",
    crunchyrollUrl:
      "https://www.crunchyroll.com/pt-br/series/GG5H5XQ7D/kaiju-no-8",
  },
  {
    anilistId: 900003,
    titleRomaji:
      "From Overshadowed to Overpowered: Second Reincarnation of a Talentless Sage",
    crunchyrollUrl:
      "https://www.crunchyroll.com/pt-br/series/GT00378115/from-overshadowed-to-overpowered-second-reincarnation-of-a-talentless-sage",
  },
  {
    anilistId: 900004,
    titleRomaji: "Re:Zero − Starting Life in Another World",
    crunchyrollUrl:
      "https://www.crunchyroll.com/pt-br/series/GRGG9798R/rezero--starting-life-in-another-world-",
  },
  {
    anilistId: 900005,
    titleRomaji: "Kaiju Girl Caramelise",
    crunchyrollUrl:
      "https://www.crunchyroll.com/pt-br/series/GT00378081/kaiju-girl-caramelise",
  },
  {
    anilistId: 900006,
    titleRomaji: "Jujutsu Kaisen",
    crunchyrollUrl:
      "https://www.crunchyroll.com/pt-br/series/GRDV0019R/jujutsu-kaisen",
  },
];

/**
 * Anime extra, só para os testes de remoção/validação de formulário —
 * mantém os 6 animes reais acima intocados para o teste de criação.
 */
export const UTILITY_FIXTURE: AnimeFixture = {
  anilistId: 900099,
  titleRomaji: "Anime Utilitário de Teste",
  crunchyrollUrl: "https://www.crunchyroll.com/pt-br/series/GTEST0000/utility",
};

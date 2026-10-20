# ADR 0002 — Pendências da curadoria do catálogo

- **Status:** aberto (lista de trabalho; cada motivo se fecha quando a fonte passa a ter o dado ou alguém o preenche)
- **Gerado em:** 2026-10-20 14:30 UTC, a partir de 10.111 obras da plataforma
- **Origem:** [ADR 0001](0001-curadoria-do-catalogo.md) — Admin → Curadoria (`CurationIssue`)

A curadoria passou por todas as obras e completou tudo que as fontes (AniList e AniDB) tinham. O que ficou aqui é o que ela
**não conseguiu resolver sozinha**, e nunca foi preenchido por palpite. Cada motivo tem o CSV completo em `docs/adr/pendencias/`
(também disponível em Admin → Curadoria → CSV).

## Resumo

| Motivo | Obras | % do catálogo | CSV |
|---|---:|---:|---|
| A AniList não devolveu a obra | 0 | 0,0% | [anilist-not-found.csv](pendencias/anilist-not-found.csv) |
| Tipo desconhecido | 42 | 0,4% | [kind-unknown.csv](pendencias/kind-unknown.csv) |
| Sem gênero reconhecido | 2.527 | 25,0% | [no-genre.csv](pendencias/no-genre.csv) |
| Sem sinopse | 920 | 9,1% | [synopsis-en-missing.csv](pendencias/synopsis-en-missing.csv) |
| Sem título em inglês | 4.867 | 48,1% | [title-en-missing.csv](pendencias/title-en-missing.csv) |
| Sem título em japonês | 2.178 | 21,5% | [title-ja-missing.csv](pendencias/title-ja-missing.csv) |
| Sem site oficial | 5.850 | 57,9% | [official-site-missing.csv](pendencias/official-site-missing.csv) |
| Conteúdo adulto retirado | 12 | 0,1% | [adult-removed.csv](pendencias/adult-removed.csv) |
| **Total de pendências abertas** | **16.396** | | |

## Pendências estruturais (valem para o catálogo inteiro)

1. **Sinopse em português e em japonês.** 115 obras (1,1%) já têm a versão em português e 0 (0,0%) a japonesa guardadas. As demais são traduzidas **sob demanda**: na primeira vez que alguém abre a obra no idioma, a tradução é feita e guardada. Para traduzir tudo de uma vez é preciso uma instância própria do LibreTranslate (`LIBRETRANSLATE_URL`); o serviço gratuito limita a poucos milhares de caracteres por dia. **Decisão pendente:** hospedar o LibreTranslate.
2. **ODA × OVA.** A AniList não separa as duas coisas; `SPECIAL` foi classificado como ODA e `OVA` como OVA (ODA só quando o título diz OAD/ODA/DVD). **Decisão pendente:** confirmar essa regra ou indicar outra fonte para distinguir.
3. **Gênero Loli.** Só é aplicado quando a fonte traz exatamente essa etiqueta (e não adulta); nenhuma obra é deduzida. **Decisão pendente:** se o gênero deve existir sem fonte, quem o atribui (curadoria manual).
4. **Título em português.** Não existe fonte gratuita confiável; continua manual (`Anime.titlePortuguese`).

## Tipos no catálogo

| Tipo | Obras |
|---|---:|
| Episódios | 6.877 |
| OVA | 985 |
| ODA | 352 |
| Filme | 1.506 |
| Outros | 349 |
| Sem tipo | 42 |

## A AniList não devolveu a obra (0)

O id existe no catálogo mas a AniList não o encontrou (removido ou trocado). Os dados ficam como estão.

_Nenhuma pendência._

## Tipo desconhecido (42)

A fonte não informa se é série, OVA, ODA ou filme; sem o formato não dá para classificar.

Primeiras 25 de 42 (lista completa em [kind-unknown.csv](pendencias/kind-unknown.csv)):

- Ajisai Hen — AniDB 8495
- Anime Tenchou Gekijouban — AniDB 8063
- Archetypes Forces — AniDB 2010
- Chocotan! — AniDB 9607
- Dragon Ball Super: Broly Sky Tree Super — AniDB 16484
- Evangelion 3D — AniDB 9200
- God Eater Promotion — AniDB 10908
- Haikyuu!! (2014) — AniDB 10954
- Hana Hen — AniDB 8498
- Hassou Hen — AniDB 9755
- Hoshi Hen — AniDB 8592
- I-Cheng — AniDB 10989
- Ikitaku Naru Omise Hen — AniDB 9758
- Ishiyama-dera Engi Emaki — AniDB 12371
- JoJo no Kimyou na Bouken: The Real 4-D Dio no Sekai — AniDB 13689
- Kasa Hen — AniDB 9757
- Kemono Friends x Anisama 2017 "Anisama" — AniDB 13413
- Kidou Senshi Gundam Unicorn: A Phantom World — AniDB 12507
- Kieta Akazukin-chan — AniDB 11483
- Kimi no Sumu Machi — AniDB 11775
- Koro no Dai Sanpo — AniDB 3364
- Lord of Vermilion III Special Anime Movie — AniDB 11531
- Moshi Juexing: Suyuan Xupian — AniDB 16517
- Norman the Snowman: Kita no Kuni no Aurora (Kari) — AniDB 10054
- Planetarium Pocket Monsters: Aurora kara no Message — AniDB 15745

## Sem gênero reconhecido (2.527)

Nenhum gênero ou etiqueta da fonte corresponde à lista de 18 gêneros da plataforma.

Primeiras 25 de 2.527 (lista completa em [no-genre.csv](pendencias/no-genre.csv)):

- "0" — AniList 102416
- 100% Pascal-sensei (2017) — AniDB 12410
- 18 If — AniDB 12576
- 1989 — AniList 102987
- 2002-nen Halmeoni Ondo — AniList 116708
- 2010 — AniList 104344
- 20-dai no Heya Hen — AniDB 11394
- 3-nen D-gumi Glass no Kamen: Tobidase Watashitachi no Victory Road — AniDB 12948
- 3tsu no Kumo — AniList 7809
- 663114 — AniList 13971
- 6 Heart Princess — AniDB 12684
- 8-gatsu no Symphony: Shibuya 2002-2003 — AniList 6670
- AAA de Ikou!!: Yuuna & Akiko — AniDB 13686
- A Channel The Animation — AniDB 8107
- affordance — AniList 177223
- Afro Samurai: Resurrection — AniList 4970
- Agatha Christie no Meitantei Poirot to Marple — AniList 244
- Aggressive Retsuko (2020) — AniDB 15034
- Aggressive Retsuko (2021) — AniDB 15949
- Aggressive Retsuko (2023) — AniDB 17056
- Agitated Screams of Maggots — AniList 9056
- Agukaru: Agriculture Angel Baraki — AniDB 7944
- Agukaru: Agriculture Angel Baraki - Play with Ibaraki Hen — AniDB 10719
- Aigan Kaijuu — AniList 104289
- Aikatsu! 10th STORY: Mirai e no STARWAY — AniList 148960

## Sem sinopse (920)

Nem a AniList nem o AniDB trouxeram sinopse; sem o original não há o que traduzir para português e japonês.

Primeiras 25 de 920 (lista completa em [synopsis-en-missing.csv](pendencias/synopsis-en-missing.csv)):

- 21 Seiki Manga Hajimete Monogatari — AniList 10139
- AAA de Ikou!!: Yuuna & Akiko — AniDB 13686
- Aggressive Retsuko (2019) — AniDB 14199
- Aggressive Retsuko (2020) — AniDB 15034
- Aggressive Retsuko (2023) — AniDB 17056
- Agukaru: Agriculture Angel Baraki - Play with Ibaraki Hen — AniDB 10719
- Aigan Kaijuu — AniList 104289
- Ai o Kite — AniDB 17400
- Aishang Ta de Liyou Fanwai: Yueding de Weilai — AniDB 18663
- Akachan Honbuchou (2022) — AniDB 17123
- Akachan Honbuchou 3rd Series — AniDB 17306
- Akita Kenritsu Iburi Gakkou Chuutou Bu — AniDB 13020
- Akuei to Gacchinpo: Tenkomori — AniList 108745
- Ankoku Kazoku Warabi-san — AniList 180850
- Ano Hi, Bokura wa Senjou de: Shounenhei no Kokuhaku — AniDB 11538
- AOTU Shijie Di Er Ji — AniDB 13471
- AOTU Shijie Di San Ji — AniDB 14870
- AOTU Shijie REBORN: Di Yi Pianzhang Monu Xianjing — AniDB 20455
- Arad: Suming Zhi Men — AniList 99884
- Ashiato — AniDB 17407
- A-Shuai — AniDB 16667
- A-Shuai Di 3 Ji — AniDB 16669
- A-Shuai Di 4 Ji — AniDB 16670
- A-Shuai Di 5 Ji — AniDB 16671
- A-Shuai Di Er Ji — AniDB 16668

## Sem título em inglês (4.867)

A fonte só tem o título em romaji/japonês (comum em obras sem lançamento internacional).

Primeiras 25 de 4.867 (lista completa em [title-en-missing.csv](pendencias/title-en-missing.csv)):

- "0" — AniList 102416
- 001 — AniList 102065
- 100 Byou Cinema: Robo to Shoujo (Kari) — AniDB 8766
- 100-man no Inochi no Ue ni Ore wa Tatte Iru (2021) — AniDB 15930
- 100-Nichikan Ikita Wani — AniList 116740
- 100% Pascal-sensei — AniList 188038
- 100% Pascal-sensei (2017) — AniDB 12410
- 12-sai. — AniList 20716
- 12-sai.: Chiccha na Mune no Tokimeki — AniList 21609
- 12-sai.: Chiccha na Mune no Tokimeki 2 — AniList 21839
- 15-sai, Kyou kara Dousei Hajimemasu. — AniList 103886
- 180-byou de Kimi no Mimi wo Shiawase ni Dekiru ka? — AniList 133411
- 18 If — AniDB 12576
- 2002-nen Halmeoni Ondo — AniList 116708
- 2005-nen Uchuu no Tabi — AniList 104092
- 2010 — AniList 104344
- 20-dai no Heya Hen — AniDB 11394
- 21 Seiki Manga Hajimete Monogatari — AniList 10139
- 2200-nen Neko no Kuni Nippon — AniList 199009
- 30-sai made Doutei da to Mahou Tsukai ni Nareru Rashii: Tokubetsu-hen — AniList 176470
- 30th GUNDAM PERFECT MISSION — AniList 7113
- 3D Atashin'chi: Jounetsu no Chou Chounouryoku♪Haha Dai Bousou! — AniList 9796
- 3-nen D-gumi Glass no Kamen: Tobidase Watashitachi no Victory Road — AniDB 12948
- 47 Todoufuken R — AniList 108743
- 663114 — AniList 13971

## Sem título em japonês (2.178)

A fonte não traz o título nativo (comum em obras chinesas, coreanas e do AniDB).

Primeiras 25 de 2.178 (lista completa em [title-ja-missing.csv](pendencias/title-ja-missing.csv)):

- 100 Byou Cinema: Robo to Shoujo (Kari) — AniDB 8766
- 100-man no Inochi no Ue ni Ore wa Tatte Iru (2021) — AniDB 15930
- 100% Pascal-sensei (2017) — AniDB 12410
- 18 If — AniDB 12576
- 20-dai no Heya Hen — AniDB 11394
- 3-nen D-gumi Glass no Kamen: Tobidase Watashitachi no Victory Road — AniDB 12948
- 6 Heart Princess — AniDB 12684
- 6HP — AniDB 12682
- 7 Seeds (2020) — AniDB 15229
- 86 — AniDB 15441
- 86 (2021) — AniDB 16172
- AAA de Ikou!!: Yuuna & Akiko — AniDB 13686
- Accel World OVA — AniDB 9187
- A Channel +Smile — AniDB 8597
- A Channel The Animation — AniDB 8107
- A Day Before Us — AniDB 15500
- Afro Samurai Gekijouban — AniDB 11542
- Aggressive Retsuko (2019) — AniDB 14199
- Aggressive Retsuko (2020) — AniDB 15034
- Aggressive Retsuko (2021) — AniDB 15949
- Aggressive Retsuko (2023) — AniDB 17056
- Agukaru: Agriculture Angel Baraki — AniDB 7944
- Agukaru: Agriculture Angel Baraki - Play with Ibaraki Hen — AniDB 10719
- Aika R-16 — AniDB 4852
- Aikatsu! Idol Katsudou! — AniDB 9348

## Sem site oficial (5.850)

A AniList não lista o site oficial da obra; o AniDB não traz esse link no lote importado.

Primeiras 25 de 5.850 (lista completa em [official-site-missing.csv](pendencias/official-site-missing.csv)):

- "0" — AniList 102416
- 009-1 — AniList 1583
- 07-Ghost — AniList 5525
- 100 Byou Cinema: Robo to Shoujo (Kari) — AniDB 8766
- 100-man no Inochi no Ue ni Ore wa Tatte Iru (2021) — AniDB 15930
- 100% Pascal-sensei — AniList 188038
- 100% Pascal-sensei (2017) — AniDB 12410
- 11eyes — AniList 6682
- 12-sai. — AniList 20716
- 15-sai, Kyou kara Dousei Hajimemasu. — AniList 103886
- 18 If — AniDB 12576
- 1989 — AniList 102987
- 1999! Shenmi Xue Duice Bu — AniList 217391
- 2005-nen Uchuu no Tabi — AniList 104092
- 2010 — AniList 104344
- 20-dai no Heya Hen — AniDB 11394
- 21 Seiki Manga Hajimete Monogatari — AniList 10139
- 30th GUNDAM PERFECT MISSION — AniList 7113
- 3D Atashin'chi: Jounetsu no Chou Chounouryoku♪Haha Dai Bousou! — AniList 9796
- 3-nen D-gumi Glass no Kamen — AniList 97589
- 3-nen D-gumi Glass no Kamen: Tobidase Watashitachi no Victory Road — AniDB 12948
- 3tsu no Kumo — AniList 7809
- 663114 — AniList 13971
- 6 Angels — AniList 2475
- 6 Heart Princess — AniDB 12684

## Conteúdo adulto retirado (12)

A obra foi marcada como adulta pela AniList e saiu da plataforma.

Primeiras 12 de 12 (lista completa em [adult-removed.csv](pendencias/adult-removed.csv)):

- Balgwanghaneun Hyeondaesa — AniList 103746
- Ikoku Irokoi Romantan — AniList 3210
- Ingoku Danchi — AniList 206166
- Joleobban — AniList 102426
- Kagaku na Yatsura — AniList 15391
- Kyojinzoku no Hanayome — AniList 116648
- Lingerie Senshi Papillon Rose — AniList 1995
- Nana to Kaoru — AniList 9741
- Okane ga Nai — AniList 2148
- Rescue ME! — AniList 18039
- Saezuru Tori wa Habatakanai: Don't stay gold — AniList 115567
- To LOVE-Ru: Multiplication - Mae kara Ushiro kara — AniList 100659

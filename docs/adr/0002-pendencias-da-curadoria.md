# ADR 0002 — Pendências da curadoria do catálogo

- **Status:** aberto (lista de trabalho; cada motivo se fecha quando a fonte passa a ter o dado ou alguém o preenche)
- **Gerado em:** 2026-10-21 03:42 UTC, a partir de 15.121 obras da plataforma
- **Origem:** [ADR 0001](0001-curadoria-do-catalogo.md) — Admin → Curadoria (`CurationIssue`)

A curadoria passou por todas as obras e completou tudo que as fontes (AniList e AniDB) tinham. O que ficou aqui é o que ela
**não conseguiu resolver sozinha**, e nunca foi preenchido por palpite. Cada motivo tem o CSV completo em `docs/adr/pendencias/`
(também disponível em Admin → Curadoria → CSV).

## Resumo

| Motivo | Obras | % do catálogo | CSV |
|---|---:|---:|---|
| A AniList não devolveu a obra | 0 | 0,0% | [anilist-not-found.csv](pendencias/anilist-not-found.csv) |
| Tipo desconhecido | 42 | 0,3% | [kind-unknown.csv](pendencias/kind-unknown.csv) |
| Sem gênero reconhecido | 3.464 | 22,9% | [no-genre.csv](pendencias/no-genre.csv) |
| Sem sinopse | 1.281 | 8,5% | [synopsis-en-missing.csv](pendencias/synopsis-en-missing.csv) |
| Sem título em inglês | 7.796 | 51,6% | [title-en-missing.csv](pendencias/title-en-missing.csv) |
| Sem título em japonês | 2.180 | 14,4% | [title-ja-missing.csv](pendencias/title-ja-missing.csv) |
| Sem site oficial | 9.788 | 64,7% | [official-site-missing.csv](pendencias/official-site-missing.csv) |
| Conteúdo adulto retirado | 53 | 0,4% | [adult-removed.csv](pendencias/adult-removed.csv) |
| Nome para conferir | 5 | 0,0% | [name-invalid.csv](pendencias/name-invalid.csv) |
| Possível obra duplicada | 24 | 0,2% | [duplicate-suspect.csv](pendencias/duplicate-suspect.csv) |
| Sem data para a linha do tempo | 0 | 0,0% | [timeline-undated.csv](pendencias/timeline-undated.csv) |
| Estreia antes do prequel | 34 | 0,2% | [timeline-conflict.csv](pendencias/timeline-conflict.csv) |
| **Total de pendências abertas** | **24.667** | | |

## Pendências estruturais (valem para o catálogo inteiro)

1. **Sinopse em português e em japonês.** 13.843 obras (91,5%) já têm a versão em português e 0 (0,0%) a japonesa guardadas. A tradução em lote (Admin → Curadoria → Sinopses em português) usa o LibreTranslate próprio (`LIBRETRANSLATE_URL`); sem ele, o serviço gratuito limita a poucos milhares de caracteres por dia e o resto é traduzido sob demanda. **Decisão pendente:** traduzir também para o japonês.
2. **ODA × OVA.** A AniList não separa as duas coisas; `SPECIAL` foi classificado como ODA e `OVA` como OVA (ODA só quando o título diz OAD/ODA/DVD). **Decisão pendente:** confirmar essa regra ou indicar outra fonte para distinguir.
3. **Gênero Loli.** Só é aplicado quando a fonte traz exatamente essa etiqueta (e não adulta); nenhuma obra é deduzida. **Decisão pendente:** se o gênero deve existir sem fonte, quem o atribui (curadoria manual).
4. **Título em português.** Não existe fonte gratuita confiável; continua manual (`Anime.titlePortuguese`).

## Tipos no catálogo

| Tipo | Obras |
|---|---:|
| Episódios | 8.720 |
| OVA | 2.091 |
| ODA | 837 |
| Filme | 3.082 |
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

## Sem gênero reconhecido (3.464)

Nenhum gênero ou etiqueta da fonte corresponde à lista de 18 gêneros da plataforma.

Primeiras 25 de 3.464 (lista completa em [no-genre.csv](pendencias/no-genre.csv)):

- "0" — AniList 102416
- 0-sen Hayato — AniList 12763
- 100 Banme no Saru — AniList 121651
- 100% Pascal-sensei (2017) — AniDB 12410
- 11 Piki no Neko — AniList 6071
- 11 Piki no Neko to Ahoudori — AniList 6072
- 12-gatsu no Uta — AniList 99211
- 18 If — AniDB 12576
- 1989 — AniList 102987
- 2002-nen Halmeoni Ondo — AniList 116708
- 2010 — AniList 104344
- 20-dai no Heya Hen — AniDB 11394
- 21 Emon: Sora Ike! Hadashi no Princess — AniList 6074
- 22/7: 8+3=? — AniList 114249
- 3 Choume no Tama: Uchi no Tama Shirimasen ka? — AniList 151765
- 3-nen D-gumi Glass no Kamen: Tobidase Watashitachi no Victory Road — AniDB 12948
- 3tsu no Kumo — AniList 7809
- 4.Eyes — AniList 102502
- 5-Oku-nen Button — AniList 150909
- 5-Oku-nen Button Part 2 — AniList 182434
- 663114 — AniList 13971
- 6 Heart Princess — AniDB 12684
- 8-gatsu no Symphony: Shibuya 2002-2003 — AniList 6670
- AAA de Ikou!!: Yuuna & Akiko — AniDB 13686
- Aa Harimanada — AniList 8216

## Sem sinopse (1.281)

Nem a AniList nem o AniDB trouxeram sinopse; sem o original não há o que traduzir para português e japonês.

Primeiras 25 de 1.281 (lista completa em [synopsis-en-missing.csv](pendencias/synopsis-en-missing.csv)):

- 11 Piki no Neko to Ahoudori — AniList 6072
- 2020 Nyeon Ujuui Wonder Kiddy — AniList 16696
- 21 Emon: Sora Ike! Hadashi no Princess — AniList 6074
- 21 Emon Uchuu e Irasshai! — AniList 6073
- 21 Seiki Manga Hajimete Monogatari — AniList 10139
- 82 Oshougatsuda yo! Doraemon, Kaibutsu-kun, Ninja Hattori-kun — AniList 2630
- AAA de Ikou!!: Yuuna & Akiko — AniDB 13686
- "Aesop" no Ohanashi yori: Ushi to Kaeru, Yokubatta Inu — AniList 185879
- Agent Blue — AniList 184099
- Aggressive Retsuko (2019) — AniDB 14199
- Aggressive Retsuko (2020) — AniDB 15034
- Aggressive Retsuko (2023) — AniDB 17056
- Agukaru: Agriculture Angel Baraki - Play with Ibaraki Hen — AniDB 10719
- Aigan Kaijuu — AniList 104289
- Ai no Kiseki: Doctor Norman Monogatari — AniList 181460
- Ai o Kite — AniDB 17400
- Aishang Ta de Liyou Fanwai: Yueding de Weilai — AniDB 18663
- Akachan Honbuchou (2022) — AniDB 17123
- Aka-chan Honbuchou 2nd Season — AniList 144852
- Akachan Honbuchou 3rd Series — AniDB 17306
- Akadou Suzunosuke — AniList 11275
- Akita Kenritsu Iburi Gakkou Chuutou Bu — AniDB 13020
- Akuei to Gacchinpo: Tenkomori — AniList 108745
- Akuma-kun: Youkoso Akuma Land e!! — AniList 8227
- Alice Tantei Kyoku — AniList 18819

## Sem título em inglês (7.796)

A fonte só tem o título em romaji/japonês (comum em obras sem lançamento internacional).

Primeiras 25 de 7.796 (lista completa em [title-en-missing.csv](pendencias/title-en-missing.csv)):

- "0" — AniList 102416
- 001 — AniList 102065
- 0-sen Hayato — AniList 12763
- 100% — AniList 7374
- 1001 Nights — AniList 3914
- 100 Banme no Saru — AniList 121651
- 100 Byou Cinema: Robo to Shoujo (Kari) — AniDB 8766
- 100-man no Inochi no Ue ni Ore wa Tatte Iru (2021) — AniDB 15930
- 100-Nichikan Ikita Wani — AniList 116740
- 100% Pascal-sensei — AniList 188038
- 100% Pascal-sensei (2017) — AniDB 12410
- 12-gatsu no Uta — AniList 99211
- 1+2=Paradise — AniList 2730
- 12-sai. — AniList 20716
- 12-sai.: Chiccha na Mune no Tokimeki — AniList 21609
- 12-sai.: Chiccha na Mune no Tokimeki 2 — AniList 21839
- 12 Senshi Bakuretsu Eto Ranger — AniList 2757
- 12 Zhi Wenzi He 5 Ge Ren — AniList 150597
- 15-sai, Kyou kara Dousei Hajimemasu. — AniList 103886
- 15 Sonyeon Uju Pyoryugi — AniList 18305
- 15th Anniversary Short Animation: Battle Spirits Shounen Toppa Bashin × Saikyou Ginga Ultimate Zero Battle Spirits — AniList 169319
- 180-byou de Kimi no Mimi wo Shiawase ni Dekiru ka? — AniList 133411
- 18if — AniList 98512
- 18 If — AniDB 12576
- 1-gatsu ni wa Christmas — AniList 6060

## Sem título em japonês (2.180)

A fonte não traz o título nativo (comum em obras chinesas, coreanas e do AniDB).

Primeiras 25 de 2.180 (lista completa em [title-ja-missing.csv](pendencias/title-ja-missing.csv)):

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

## Sem site oficial (9.788)

A AniList não lista o site oficial da obra; o AniDB não traz esse link no lote importado.

Primeiras 25 de 9.788 (lista completa em [official-site-missing.csv](pendencias/official-site-missing.csv)):

- "0" — AniList 102416
- 009-1 — AniList 1583
- 07-Ghost — AniList 5525
- 0-sen Hayato — AniList 12763
- 100% — AniList 7374
- 1000-nen Joou: Queen Millennia — AniList 1549
- 1001 Nights — AniList 3914
- 100 Banme no Saru — AniList 121651
- 100 Byou Cinema: Robo to Shoujo (Kari) — AniDB 8766
- 100-man no Inochi no Ue ni Ore wa Tatte Iru (2021) — AniDB 15930
- 100% Pascal-sensei — AniList 188038
- 100% Pascal-sensei (2017) — AniDB 12410
- 11eyes — AniList 6682
- 11-nin Iru! — AniList 1901
- 11 Piki no Neko — AniList 6071
- 11 Piki no Neko to Ahoudori — AniList 6072
- 12-gatsu no Uta — AniList 99211
- 1+2=Paradise — AniList 2730
- 12-sai. — AniList 20716
- 12 Senshi Bakuretsu Eto Ranger — AniList 2757
- 12 Zhi Wenzi He 5 Ge Ren — AniList 150597
- 15-sai, Kyou kara Dousei Hajimemasu. — AniList 103886
- 15 Sonyeon Uju Pyoryugi — AniList 18305
- 15th Anniversary Short Animation: Battle Spirits Shounen Toppa Bashin × Saikyou Ginga Ultimate Zero Battle Spirits — AniList 169319
- 18 If — AniDB 12576

## Conteúdo adulto retirado (53)

A obra foi marcada como adulta pela AniList e saiu da plataforma.

Primeiras 25 de 53 (lista completa em [adult-removed.csv](pendencias/adult-removed.csv)):

- Android wa Keiken Ninzuu ni Hairimasu ka?? — AniList 192867
- Android wa Keiken Ninzuu ni Hairimasu ka??: 5-kakan Tsuzukete......? — AniList 208517
- Balgwanghaneun Hyeondaesa — AniList 103746
- Body Jack: Tanoshii Yutai Ridatsu — AniList 4149
- Chika Gentou Gekiga: Shoujo Tsubaki — AniList 2981
- Cleopatra — AniList 2755
- Dokushin Apartment Dokudamisou — AniList 9499
- Doukyuusei 2 — AniList 4842
- Doukyuusei Climax — AniList 4841
- Doukyuusei: Natsu no Owari ni — AniList 3558
- Hanappe Bazooka — AniList 4042
- Harem Camp! — AniList 153567
- Hitozuma no Kuchibiru wa Kan Chu-Hi no Aji ga Shite — AniList 186789
- Hitozuma no Kuchibiru wa Kan Chu-Hi no Aji ga Shite OVA — AniList 194087
- Hon Ran — AniList 6090
- Ichigo Aika: Zatsu de Namaiki na Imouto to Warikirenai Ani — AniList 198767
- Ikenai BOY — AniList 17823
- Ikoku Irokoi Romantan — AniList 3210
- Ingoku Danchi — AniList 206166
- Isekai Meikyuu de Harem wo — AniList 127090
- Isekai Meikyuu de Harem wo OVA — AniList 151632
- Ishuzoku Reviewers — AniList 110270
- Joleobban — AniList 102426
- Kagaku na Yatsura — AniList 15391
- Kaifuku Jutsushi no Yarinaoshi — AniList 113425

## Nome para conferir (5)

O nome da obra tem algo que não dá para corrigir sozinho (só números, texto corrompido, japonês no campo de inglês). Espaços e entidades HTML sobrando já foram corrigidos.

Primeiras 5 de 5 (lista completa em [name-invalid.csv](pendencias/name-invalid.csv)):

- 001 — AniList 102065 — título só com números («001»)
- 1989 — AniList 102987 — título só com números («1989»)
- 2010 — AniList 104344 — título só com números («2010»)
- 663114 — AniList 13971 — título só com números («663114»)
- 86 — AniDB 15441 — título só com números («86»)

## Possível obra duplicada (24)

Outra obra tem o mesmo id na MyAnimeList, ou o mesmo título (sem contar maiúsculas, acentos e pontuação), o mesmo tipo e o mesmo ano. Quem decide se é a mesma é uma pessoa.

Primeiras 24 de 24 (lista completa em [duplicate-suspect.csv](pendencias/duplicate-suspect.csv)):

- 18if — AniList 98512 — mesmo título e ano, vindas de fontes diferentes — «18 If» (AniDB 12576)
- 18 If — AniDB 12576 — mesmo título e ano, vindas de fontes diferentes — «18if» (AniList 98512)
- Chikatetsu ni Noru — AniList 119872 — mesmo título e ano, vindas de fontes diferentes — «Chikatetsu ni Noru!» (AniDB 12151)
- Chikatetsu ni Noru! — AniDB 12151 — mesmo título e ano, vindas de fontes diferentes — «Chikatetsu ni Noru» (AniList 119872)
- ID: INDEED — AniList 131923 — mesmo título e ano, vindas de fontes diferentes — «ID:INDEED» (AniDB 15978)
- ID:INDEED — AniDB 15978 — mesmo título e ano, vindas de fontes diferentes — «ID: INDEED» (AniList 131923)
- JoJo no Kimyou na Bouken: Stone Ocean (Part 2) — AniDB 17286 — mesmo título e ano, vindas de fontes diferentes — «JoJo no Kimyou na Bouken: Stone Ocean Part 2» (AniList 146722)
- JoJo no Kimyou na Bouken: Stone Ocean Part 2 — AniList 146722 — mesmo título e ano, vindas de fontes diferentes — «JoJo no Kimyou na Bouken: Stone Ocean (Part 2)» (AniDB 17286)
- Kochinpa! Dai Ni Ki — AniDB 12617 — mesmo título e ano, vindas de fontes diferentes — «KochinPa! Dainiki» (AniList 98090)
- KochinPa! Dainiki — AniList 98090 — mesmo título e ano, vindas de fontes diferentes — «Kochinpa! Dai Ni Ki» (AniDB 12617)
- Kono Sekai no Tanoshimikata: Secret Story Film — AniList 123434 — mesmo título e ano, vindas de fontes diferentes — «Kono Sekai no Tanoshimikata: Secret Story Film» (AniDB 15706)
- Kono Sekai no Tanoshimikata: Secret Story Film — AniDB 15706 — mesmo título e ano, vindas de fontes diferentes — «Kono Sekai no Tanoshimikata: Secret Story Film» (AniList 123434)
- Mutafukaz — AniDB 14622 — mesmo título e ano, vindas de fontes diferentes — «MUTAFUKAZ» (AniList 100356)
- MUTAFUKAZ — AniList 100356 — mesmo título e ano, vindas de fontes diferentes — «Mutafukaz» (AniDB 14622)
- Seitokai Yakuindomo * OVA — AniDB 10810 — mesmo título e ano, vindas de fontes diferentes — «Seitokai Yakuindomo＊ OVA» (AniList 20826)
- Seitokai Yakuindomo＊ OVA — AniList 20826 — mesmo título e ano, vindas de fontes diferentes — «Seitokai Yakuindomo * OVA» (AniDB 10810)
- Shabake — AniDB 16398 — mesmo título e ano, vindas de fontes diferentes — «Shabake» (AniList 137613)
- Shabake — AniList 137613 — mesmo título e ano, vindas de fontes diferentes — «Shabake» (AniDB 16398)
- Tu Bian Yingxiong LEAF — AniList 98575 — mesmo título e ano, vindas de fontes diferentes — «Tu Bian Yingxiong LEAF» (AniDB 14380)
- Tu Bian Yingxiong LEAF — AniDB 14380 — mesmo título e ano, vindas de fontes diferentes — «Tu Bian Yingxiong LEAF» (AniList 98575)
- Usagi no Mofy — AniList 112145 — mesmo título e ano, vindas de fontes diferentes — «Usagi no Mofy» (AniDB 9297)
- Usagi no Mofy — AniDB 9297 — mesmo título e ano, vindas de fontes diferentes — «Usagi no Mofy» (AniList 112145)
- Walking Meat — AniList 104746 — mesmo título e ano, vindas de fontes diferentes — «Walking Meat» (AniDB 12220)
- Walking Meat — AniDB 12220 — mesmo título e ano, vindas de fontes diferentes — «Walking Meat» (AniList 104746)

## Sem data para a linha do tempo (0)

Nem a data de estreia nem a temporada são conhecidas; a obra fica no fim da linha do tempo da franquia, sem posição garantida.

_Nenhuma pendência._

## Estreia antes do prequel (34)

A AniList diz que a série é sequência de outra, mas ela estreou antes do prequel. Ou uma data está errada, ou a relação segue a ordem da história (Gundam, Dragon Ball…) e não a de estreia; a linha do tempo usa a ordem de estreia.

Primeiras 25 de 34 (lista completa em [timeline-conflict.csv](pendencias/timeline-conflict.csv)):

- Arifureta Shokugyou de Sekai Saikyou — AniList 100668 — estreou antes do prequel (AniList 145560)
- Bananya — AniList 21704 — estreou antes do prequel (AniList 110881)
- Barakamon — AniList 20722 — estreou antes do prequel (AniList 21626)
- Berserk — AniList 21560 — estreou antes do prequel (AniList 155011)
- BROTHERHOOD FINAL FANTASY XV — AniList 21728 — estreou antes do prequel (AniList 107624)
- Cardfight!! Vanguard (2018) — AniList 101594 — estreou antes do prequel (AniList 111144)
- Danganronpa: Kibou no Gakuen to Zetsubou no Koukousei - The Animation — AniList 16592 — estreou antes do prequel (AniList 21825)
- Di Gi Charat — AniList 293 — estreou antes do prequel (AniList 1597)
- Dragon Ball Super — AniList 21175 — estreou antes do prequel (AniList 170083)
- Fireball — AniList 4362 — estreou antes do prequel (AniList 10348)
- Fireball Charming — AniList 10348 — estreou antes do prequel (AniList 100282)
- Fireball Humorous — AniList 100282 — estreou antes do prequel (AniList 125491)
- Gegege no Kitarou (1968) — AniList 5688 — estreou antes do prequel (AniList 8158)
- Gegege no Kitarou (1971) — AniList 6971 — estreou antes do prequel (AniList 8158)
- Gegege no Kitarou (1985) — AniList 7307 — estreou antes do prequel (AniList 8158)
- Ginga Tetsudou 999 — AniList 1491 — estreou antes do prequel (AniList 1377)
- Gundam Build Fighters Try — AniList 20739 — estreou antes do prequel (AniList 99732)
- Hokuto no Ken — AniList 967 — estreou antes do prequel (AniList 1541)
- Kidou Senshi Gundam — AniList 80 — estreou antes do prequel (AniList 108039)
- Lupin III — AniList 1412 — estreou antes do prequel (AniList 155925)
- Magi: The labyrinth of magic — AniList 14513 — estreou antes do prequel (AniList 21394)
- Muv-Luv Alternative: Total Eclipse — AniList 11021 — estreou antes do prequel (AniList 21201)
- ONE PIECE — AniList 21 — estreou antes do prequel (AniList 167404)
- Oshiri Tantei — AniList 100790 — estreou antes do prequel (AniList 201910)
- Perman — AniList 6303 — estreou antes do prequel (AniList 11595)

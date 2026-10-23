# ADR 0005 — Reboots, versões da história e arcos (Epic 48)

Status: aceito; a pesquisa segue em lotes (ver "Pendências").

## O problema

Algumas histórias foram **refeitas do zero** (reboot): Hunter x Hunter (1999 e 2011), Fruits Basket (2001 e 2019), Dororo, Trigun,
Sailor Moon Crystal… A AniList liga as duas como "versão alternativa", mas essa mesma relação também liga universos que só se
parecem (as 22 séries Precure, por exemplo). Por isso **nome, sinopse e a própria relação não decidem** se uma obra é reboot de
outra: cada par precisa ser pesquisado. Além disso, alguns reboots **vão além** do que a versão antiga contou (o de 2011 de Hunter
x Hunter segue no episódio 76, o arco das Formigas-Quimera, o que o anime de 1999 nunca adaptou), e a linha do tempo precisa
mostrar isso e separar os episódios por arcos.

## Decisões

- **Vínculo de reboot** (`StoryLink`): `oldAnilistId` → `newAnilistId`, com `coverage` FULL (o reboot conta a mesma história) ou
  PARTIAL (vai além; `beyondFromEpisode` é o episódio **do reboot** em que isso começa), nota e fonte.
- **Cada versão tem a sua linha do tempo.** O vínculo tira da franquia a relação entre as duas obras: a auditoria passa a gravar
  uma franquia por versão, e a linha do tempo, a navegação da franquia e as temporadas da página não mostram o conteúdo da outra
  versão (nem as temporadas, OVA, ODA e filmes dela). O que liga uma à outra é só o vínculo.
- **A versão mais atual é sempre o reboot**: a validação do lote recusa um reboot que tenha estreado antes da versão antiga.
- **As versões se apontam.** Em "Histórias relacionadas", um cartão "Reboot" / "Versão antiga" diz o que o reboot cobre, a partir
  de que episódio vai além, a nota da pesquisa e a fonte, com o link para a outra versão.
- **Pontos de virada na linha dos episódios.** No reboot que vai além: "A partir do episódio X o reboot vai além da versão antiga",
  logo antes do arco novo. Na versão antiga: "Aqui termina esta versão; a história continua em [reboot] a partir do episódio X".
- **Arcos** (`StoryArc`): faixa de episódios com nome (inglês, e português/japonês quando houver). A linha do tempo dos episódios
  sai separada por arcos (cabeçalho "Arco N · EP a–b"); sem episódios com data, a linha mostra só os arcos e os avisos.
- **A pesquisa é em lotes** (`docs/reboots/loots/*.json`, formato em [docs/reboots/README.md](../reboots/README.md)): cada lote tem
  nome, é validado inteiro antes de gravar (ids no catálogo, regras de cobertura, arcos em ordem e dentro dos episódios) e pode
  ser reaplicado sem duplicar. Aplica-se em Admin → Curadoria → **Reboots e arcos** (cola o JSON) ou por `POST /api/admin/story`;
  depois do lote, as linhas do tempo são refeitas em segundo plano. Cada par conferido sai da fila (`StoryReview`), seja
  REBOOT ou NOT_REBOOT.
- **Nada é decidido sozinho**: a fila (`findRebootCandidates`) só lista os pares de séries ligados como versão alternativa;
  o veredito vem da pesquisa.

## Primeira rodada (banco de desenvolvimento, 2026-10-22)

A fila tinha **562 pares** de séries ligados como versão alternativa; **561 foram conferidos** (1 segue na fila).

| Lote | Pares | Resultado |
|---|---:|---|
| `reboots-001` | 38 | 32 reboots (Hunter x Hunter, Fruits Basket, Dororo, Trigun, Rurouni Kenshin, Ranma ½, Urusei Yatsura, Shaman King, Tokyo Mew Mew, Sailor Moon, Kanon, Digimon Adventure, Spice and Wolf, 15 pares de Gegege no Kitarou) e 6 que não são (Dragon Ball Z × Kai, Haruhi, Fate/stay night, Rozen Maiden 2013 é continuação) |
| `reboots-002` | 68 | reboots/novas adaptações (Saint Seiya × Knights of the Zodiac, Cutey Honey, Houshin Engi, Berserk, Dr. Slump, Tetsuwan Atom, Cyborg 009, Devilman crybaby, Grendizer U, Captain Tsubasa…) |
| `reboots-003` | 8 | 2 reboots (Cutey Honey F, Gakkou no Kowai Uwasa Shin) e 6 que não são (Chouja Raideen, Yu-Gi-Oh!, EAT-MAN'98, Ghost in the Shell 2026…) |
| `reboots-004` | 28 | 12 reboots (Bakugan Battle Planet e Bakugan 2023, Keroro Gunsou☆ 2026, Xin Qin Shi Mingyue ×2, Africa no Salaryman, Zenryoku Usagi, Tanuki to Kitsune, Kinpatsu no Jeanie, Night Head 2041, Yozakura Quartet: Hana no Uta, Ekoda-chan) pesquisados em Wikipédia, AniDB/Anime-Planet e outras páginas, e 16 que não são (Keroro 2014, Uchitama?!, Bikkurimen, Shinya! Tensai Bakabon, Arad, Bartender…) |
| `series-005` | 77 | continuações, spin-offs e obras diferentes (Pokémon Generations, Fate/Apocrypha, Persona 4 Golden, Barbapapa…) |
| `franquias-001` a `004` | 342 | séries independentes da mesma franquia (Precure, Battle Spirits, Jewelpet, Brave, Pretty Rhythm/PriPara, Aikatsu, Hua Jianghu, Love Live!, Balala, THE IDOLM@STER), classificadas em bloco |

**Grau de pesquisa.** Os reboots de `reboots-001` e os de `reboots-002` com link citam a página da Wikipédia consultada
(a obra é descrita como reboot, remake ou segunda adaptação). Os demais de `reboots-002` e todos os de `series-005` e
`franquias-*` foram classificados pelo conhecimento sobre a obra, e a nota de cada vínculo diz isso: são os primeiros a rever.
Só **Hunter x Hunter** (episódio 76) e **Dragon Quest: Dai no Daibouken** (episódio 33 do reboot, aproximado: a Wikipédia diz que o anime de 1991 cobre os 10 primeiros volumes, mas não mapeia episódio a capítulo; lote `reboots-005`) têm `PARTIAL` com ponto e arcos das duas versões (listas de episódios da Wikipédia:
1999 = 3 arcos em 62 episódios; 2011 = 6 arcos em 148); Sailor Moon Crystal tem os dois arcos (Dark Kingdom 1–14, Black Moon
15–26). Para os demais reboots o vínculo é "mesma história refeita" (FULL): ainda não foi mapeado se e onde vão além da versão
antiga (ex.: as temporadas 2 e final de Fruits Basket; Shaman King 2021).

## Pendências

- **1 par** ainda na fila: Shabake (2020 × 2025); não achei nada sobre a versão de 2020.
- **Arcos**: 19 obras têm arcos (Hunter x Hunter ×2, Sailor Moon Crystal, Naruto e Naruto Shippuden no lote `arcos-001`; One Piece, Bleach, Dragon Ball, Yu Yu Hakusho, Black Clover e Fairy Tail no `arcos-002`; Dragon Ball Super, Rurouni Kenshin e Yu-Gi-Oh! Duel Monsters no `arcos-003`; Inazuma Eleven e Cardcaptor Sakura no `arcos-004`; Hajime no Ippo, Dragon Ball Z Kai (2009) e Kai (2014) no `arcos-005`, esses com as sagas de uma lista de fãs ou de wiki, sem fonte oficial), tirados das listas de episódios da Wikipédia, com os episódios avulsos fora dos arcos e as partes de um mesmo arco unidas. One Piece fica sem o arco atual (Elbaph) porque a série segue no ar e o arco ainda não tem fim. Digimon Adventure e Digimon Tamers (as fontes divergem em 1 a 3 episódios nas bordas dos arcos), Dragon Ball Z, Soul Eater, Inuyasha, Hikaru no Go (as fontes só dão arcos por capítulo ou divergem), Gintama, D.Gray-man, Boruto, Reborn! e Hokuto no Ken ficaram de fora: as páginas só dão temporadas (ou os limites vinham deduzidos), não arcos com episódios. Cerca de 2.378 séries com 26 episódios ou mais ainda não têm; o painel lista as próximas (as mais
  longas primeiro). A fonte usada é a lista de episódios da Wikipédia, que nem sempre traz arcos (Bleach e Dragon Ball Z listam
  temporadas, não sagas) e que a ferramenta de leitura devolve truncada nas séries muito longas: essas pedem leitura em partes.
- **Onde cada reboot "vai além"** (PARTIAL e `beyondFromEpisode`) nos demais reboots já vinculados. Pesquisei Shaman King 2021, Spice and Wolf 2024 e Fullmetal Alchemist: as fontes não dão o episódio (e Fullmetal Alchemist: Brotherhood não está na plataforma, então o par nem entra na fila).
- Nomes de arcos em português e japonês (hoje só em inglês).
- Reboots cuja versão antiga não está na plataforma não aparecem apontados (só existe o que está no catálogo).

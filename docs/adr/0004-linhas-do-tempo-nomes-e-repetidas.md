# ADR 0004 — Linhas do tempo, nomes e obras repetidas (Epic 45)

Status: aceito. Divergências abertas ficam em [pendencias/](pendencias/) (`name-invalid`, `duplicate-suspect`, `timeline-conflict`, `timeline-undated`).

## O que é

Uma auditoria (Admin → Curadoria → **Linhas do tempo, nomes e repetidas**) que passa por todas as obras da plataforma, franquia por
franquia, e faz três coisas. Não usa serviço externo, é idempotente e pode ser refeita a qualquer hora.

1. **Linha do tempo.** Obras ligadas por sequência, spin-off, história paralela, resumo, versão alternativa… formam uma franquia
   (`CatalogEntry.franchiseKey` = menor id da AniList do grupo; relações de personagem e "outro" não unem franquias). Dentro dela
   tudo é posto em ordem de estreia (`timelineOrder`), com o papel de cada obra (`timelineRole`):
   - **MAIN** — as séries (episódios) da maior corrente de prequel/sequência, com o número da temporada (`timelineSeason`);
   - **RELATED** — outra série ligada (spin-off, versão alternativa);
   - **SPECIAL** — OVA, ODA, filme e outros: complementares, fora da linha obrigatória.
2. **Nomes.** Espaços repetidos, entidades HTML (`&amp;`), caracteres invisíveis e quebras são **corrigidos** na hora. O que muda o
   sentido não é adivinhado e vira pendência `NAME_INVALID`: título só com números (sem outro nome), texto corrompido, japonês no
   campo de inglês.
3. **Repetidas.** Pendência `DUPLICATE_SUSPECT` em dois casos: (a) uma entrada só do AniDB e outra da AniList com título igual
   (ignorando maiúsculas, acentos e pontuação), mesmo tipo e anos próximos; (b) duas da mesma fonte com título principal ou em
   inglês idêntico, pontuação inclusa ("NEW GAME!" ≠ "NEW GAME!!"), mesmo tipo e ano. Obras ligadas por relação não contam. O id da
   MyAnimeList não é usado (a AniList o reaproveita em várias partes de uma obra). **A auditoria só aponta; juntar duas obras é
   decisão de uma pessoa.**

Também registra `TIMELINE_UNDATED` (sem data nem temporada: vai para o fim da franquia) e `TIMELINE_CONFLICT` (série que estreou
antes do prequel). Estas pendências pertencem à auditoria: a curadoria do catálogo não as fecha.

## Decisões

- A ordem é a **de estreia**, não a da história. Em Gundam, Dragon Ball, One Piece, Lupin e Gegege no Kitarou a AniList usa
  prequel/sequência pela ordem da história; essas séries aparecem em `TIMELINE_CONFLICT` e seguem a data de estreia. OVA e filmes
  "prequel" não geram conflito (a ordem da história deles é esperada).
- Obras que existem só no AniDB (sem id da AniList) não têm relações para formar franquia: ficam sem posição (`timelineRole` nulo)
  e entram só na conferência de nomes e de repetidas.
- Títulos como "86", "22/7" e "009-1" são legítimos: o título só com números só vira pendência se a obra não tem outro nome.

## Primeira execução (banco de desenvolvimento, 2026-10-21)

| | |
|---|---:|
| Obras percorridas | 15.121 |
| Franquias | 7.989 |
| Obras com posição na linha do tempo | 12.943 (MAIN 6.575 · RELATED 897 · SPECIAL 5.471) |
| Obras só do AniDB, sem posição | 2.178 |
| Nomes corrigidos | 298 |
| Nomes para conferir | 5 |
| Obras repetidas (grupos) | 24 obras em 12 grupos |
| Série que estreou antes do prequel | 34 |
| Sem data | 0 |

## Pendências para decidir

- Juntar as 12 obras repetidas (AniDB + AniList): hoje só estão listadas.
- Decidir se a página da obra deve oferecer a ordem da história além da ordem de estreia.
- Ligar as obras só do AniDB à AniList (depende do cliente válido do AniDB, ver ADR 0003).

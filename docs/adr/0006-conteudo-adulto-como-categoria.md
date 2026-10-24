# ADR 0006 — Conteúdo adulto como categoria (Hentai)

Status: aceito em 23/10/2026. Substitui a regra "nenhum hentai" de 12/10/2026.

## Contexto

Desde 12/10 a plataforma bloqueava todo conteúdo adulto: o gênero "Hentai" (e a marca +18 da AniList, `isAdult`) tirava a
obra da busca, da temporada, do calendário, da importação e do "acompanhar", e a curadoria a tirava da plataforma com a
pendência ADULT_REMOVED. A varredura de dados de 23/10 ([docs/validacao](../validacao/varredura-2026-10-23.md)) achou 4
obras marcadas como adultas que continuavam na plataforma (Ingoku Danchi, Kyojinzoku no Hanayome, Saezuru Tori wa
Habatakanai: Don't stay gold, To LOVE-Ru: Multiplication). Perguntado, o usuário escolheu deixá-las com a categoria
"Hentai" e visíveis, mudando a regra.

## Decisão

- **O conteúdo adulto faz parte da plataforma como uma categoria.** A obra fica com o gênero "Hentai", que aparece entre
  os gêneros e no filtro do Explorar como os demais.
- **A página da obra avisa**: "+18 · Conteúdo adulto · categoria Hentai" logo abaixo das etiquetas (sua lista e página
  pública).
- **Como a obra entra na categoria:** gênero "Hentai" da AniList; marca +18 da AniList (`isAdult`), mesmo sem o gênero
  (`normalizeMedia` e a curadoria); tags explícitas do AniDB (sex, pornography, erotica, hentai) na importação do HTML.
- **Nada é bloqueado.** O bloqueio antigo continua no código, desligado, atrás de `ADULT_CONTENT_BLOCKED` em
  `src/lib/contentPolicy.ts`: todo ponto que traz obras de fora ainda passa por `hasBlockedGenre`/`NOT_BLOCKED_GENRE`, e
  ligar a constante volta à regra de 12/10 (filtros, IGNORED na importação, ADULT_REMOVED na curadoria).
- **Só entra o que o admin traz** continua valendo: o conteúdo adulto passa pelos mesmos painéis de importação.

## Consequências

- As 4 obras ganharam o gênero Hentai no catálogo, na página pública, na lista e no calendário; as pendências
  ADULT_REMOVED delas foram fechadas.
- As obras adultas que a curadoria tirou antes (49, fora da plataforma) não voltam sozinhas: entram se o admin as trouxer
  de novo.
- Specs 74, 75, 76, 95 e 98 passaram a conferir a regra nova (aparece, com aviso; importa como Hentai; a curadoria não
  tira).

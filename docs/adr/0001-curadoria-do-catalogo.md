# ADR 0001 — Curadoria do catálogo: tipos, gêneros, títulos, sinopses, nota e linha do tempo

- **Status:** aceito (Epic 42)
- **Contexto de uso:** o catálogo tem ~10 mil obras vindas da AniList e do AniDB. Cada fonte descreve a obra de um jeito, e a
  plataforma precisava de um padrão único: separar a história principal do que é complementar, ter um vocabulário fechado de
  gêneros, ter títulos e sinopses nos três idiomas e uma nota própria do site.

## Decisões

### 1. Tipos de obra na linha da história (`CatalogEntry.kind`)

| Tipo | O que é | Vem de (formato da fonte) |
|---|---|---|
| **Episódios** (`EPISODE`) | a série; tem temporadas, e uma temporada pode mudar de nome | `TV`, `TV_SHORT`, `ONA` |
| **OVA** (`OVA`) | Animação Original em Vídeo: especial fora da linha cronológica, história complementar | `OVA` |
| **ODA** (`ODA`) | DVD de Animação Original: especial que vem em DVD, conteúdo a mais que quase nunca entra na história | `SPECIAL`; `OVA` cujo título diz OAD/ODA/DVD |
| **Filme** (`MOVIE`) | resumo de parte da temporada ou história paralela fora da principal | `MOVIE` |
| **Outros** (`OTHER`) | o que não é nenhum dos quatro (videoclipe, música) | `MUSIC` |

- Só **Episódios** fazem parte da linha obrigatória. OVA, ODA e Filme são complementares e opcionais.
- O que importa de verdade é avisar dos **episódios** que a pessoa acompanha: o notificador continua gerando alerta só de
  episódio. Os especiais **não geram alerta**; aparecem na página da obra, num aviso junto da sinopse ("Esta obra tem 2 OVA e
  1 filme fora da linha principal") e na seção "Especiais e filmes".
- O `format` original da fonte continua guardado; `kind` é derivado dele (`src/lib/curation/kind.ts`).
- **Interpretação a confirmar:** a AniList não distingue ODA de OVA; `SPECIAL` virou ODA por ser, em geral, o especial que
  acompanha DVD/BD. Obra sem formato em nenhuma fonte fica sem tipo e entra nas pendências.

### 2. Gêneros: vocabulário fechado de 18

`Mecha, Adventure, Drama, Loli, Shounen, Shoujo, Shounen-ai, Shoujo-ai, Yaoi, Yuri, Josei, Romance, Sci-fi, Ecchi, Isekai,
Slice of Life, Comedy, Parody` — sempre em inglês ou em japonês romanizado, nunca traduzidos.

- Substitui a lista do Epic 3: **entram** Drama, Josei e Loli; **saem** Supernatural, Seinen e Hentai (como gênero visível).
- Os gêneros vêm dos `genres` e das **etiquetas** (`tags`) da AniList com relevância ≥ 50: demografia (Shounen, Shoujo, Josei),
  tema (Isekai, Parody) e relações (Boys' Love → Shounen-ai, Girls' Love → Shoujo-ai). Termo sem correspondência é descartado,
  nunca inventado (Action, Fantasy, Sports… não existem na plataforma).
- **Loli** só entra se a fonte trouxer exatamente essa etiqueta e ela não for adulta; nada é deduzido. Etiqueta adulta nunca
  vira gênero.
- **Hentai continua existindo como marcador interno** (`ADULT_MARKER`): não aparece em filtro nem em obra, mas precisa sobreviver
  à normalização para que a política de conteúdo (`contentPolicy`) barre a obra antes de ela ser guardada. A curadoria também
  retira da plataforma qualquer obra que a AniList marque como adulta (`isAdult`).
- Obra que já tinha gêneros mantém os que continuam no vocabulário e ganha os que a fonte traz hoje (união, sem perda).

### 3. Títulos nos três idiomas

Romaji, inglês e japonês (nativo). A curadoria **só completa** o que falta (nunca sobrescreve): títulos fixados pelo admin e os do
AniDB continuam valendo. O que a fonte não tem vira pendência (`TITLE_EN_MISSING`, `TITLE_JA_MISSING`).
- **Interpretação a confirmar:** "três idiomas" foi lido como romaji/inglês/japonês. O título em português continua manual
  (`Anime.titlePortuguese`), porque não existe fonte confiável.

### 4. Sinopses em português, inglês e japonês

- Inglês é o original (AniList ou AniDB): vira `CatalogEntry.description`; sem ele a pendência é `SYNOPSIS_EN_MISSING`.
- Português e japonês vêm da tradução automática já guardada (`SynopsisTranslation`), copiada para
  `descriptionPt`/`descriptionJa`. A tradução em massa não é feita nesta curadoria: o serviço gratuito (MyMemory) limita a poucos
  milhares de caracteres por dia, e ~10 mil sinopses exigem uma instância própria (`LIBRETRANSLATE_URL`). Até lá a tradução
  continua **sob demanda**: na primeira vez que alguém abre a obra em português ou japonês, ela é traduzida e guardada.
- **Pendência estrutural:** instalar o LibreTranslate para traduzir tudo de uma vez (ver o ADR de pendências).

### 5. Site oficial

Link "Official Site" da AniList (`CatalogEntry.officialSite`), exibido na página da obra. Obra sem o link (e as só do AniDB)
vira pendência `OFFICIAL_SITE_MISSING`.

### 6. Nota do site

- A nota exibida é a **do site** (0 a 10), não a da AniList nem a da AniDB. Toda obra começa em **5**.
- Quem marca "Terminei" pode dar uma nota inteira de 0 a 10 (`Anime.userScore`); só a nota de quem terminou conta.
- Fórmula (`src/lib/siteScore.ts`): média com peso inicial — o 5 vale 3 notas. Uma única nota 10 leva a obra a 6,3, não a 10;
  com 60 notas 9 ela chega a 8,8. Sair de "Terminei" ou da lista tira a nota da conta.
- **Interpretação a confirmar:** "regulando" foi lido como média suavizada (e não como média simples), para uma nota isolada
  não distorcer a obra; o peso inicial (3) é um parâmetro (`PRIOR_VOTES`).

### 7. Linha do tempo

As relações da AniList (`PREQUEL`, `SEQUEL`, `SIDE_STORY`, `SUMMARY`, `SPIN_OFF`, `ALTERNATIVE`, `PARENT`) são guardadas em
`CatalogEntry.relationsJson`. A página monta: **Temporadas** (linha principal, só episódios, em ordem, mesmo que a temporada
tenha outro nome), **Especiais e filmes** (OVA, ODA, filme, opcionais) e **Séries relacionadas** (spin-offs).

### 8. Curadoria e pendências

- A curadoria (`src/lib/curation/engine.ts`) passa por **todas** as obras da plataforma, uma a uma, em lotes de 50 consultando a
  AniList; é **retomável** (cada obra guarda a versão das regras com que foi curada) e idempotente.
- Regra de ouro: **nunca sobrescreve o que já existe**; só completa o que falta e recalcula o derivado (gêneros, tipo).
- O andamento é visual em **Admin → Curadoria** (barra, o que foi corrigido, tipos e pendências).
- Tudo que a curadoria não conseguiu resolver vira uma linha em `CurationIssue` (uma por obra e motivo) e é exportado para o
  **ADR 0002 — Pendências da curadoria** (`docs/adr/0002-pendencias-da-curadoria.md` e um CSV por motivo).

## Consequências

- O filtro **Tipo** do Explorar passou a usar os tipos acima (Episódios, OVA, ODA, Filme, Outros) em vez do formato bruto.
- Os gêneros salvos antes (inclusive os das listas das pessoas, das produções e do calendário) são reescritos pela curadoria.
- Subir `CURATION_VERSION` (`src/lib/curation/curateEntry.ts`) faz a próxima execução reprocessar o catálogo inteiro.

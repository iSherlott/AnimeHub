# FUNCTIONAL_SPEC — Especificação funcional consolidada (rev.2)

> Auditoria de 2026-10-08, **revisão 2**. **Documento de especificação para validação, não autorização para implementar.**
> Separa explicitamente, em cada requisito, o que é **confirmado**, o que foi **observado**, o que **diverge**,
> o que é **proposta da equipe** e o que depende de **decisão do responsável pelo produto**.
> Evidências e prioridades detalhadas: `FIGMA_POC_TRACEABILITY.md` (TR-xxx), `DOMAIN_AND_ARCHITECTURE_GAPS.md` (GAP-x-xx),
> `OPEN_DECISIONS.md` (D-xx). **Na rev.2 o Figma completo foi inspecionado** (17 páginas, 61 frames, 55 componentes;
> `FIGMA_INVENTORY.md`): os requisitos "RF" abaixo citam nós reais. Os frames são **especificações estáticas** (interações não
> conectadas) e os próprios frames declaram pendências (`13:41172`); o que o Figma desenha é tratado como *decisão vigente do
> design*, **não** como aprovação do produto — cada ponto de decisão aponta o D-xx correspondente.

## 1. Convenções

**Tipos de afirmação** (usados em cada requisito):
| Tag | Significado |
| --- | --- |
| **RC** | **Requisito confirmado** — afirmado pela Fonte C do roteiro (princípios P-1…P-15, §2) |
| **RF** | **Requisito documentado no Figma** (nó citado), tratado como decisão vigente do design, **não reafirmado** na Fonte C |
| **OB** | **Comportamento observado** na PoC (com evidência) |
| **DV** | **Divergência** entre fontes |
| **PT** | **Proposta técnica** da equipe (não aprovada) |
| **DP** | **Decisão pendente** (D-xx) |
| **NV** | **Não verificado** |

**P-n** = princípio n da Fonte C: P-1 organiza/descobre/acompanha lançamentos · P-2 não é streaming · P-3 não registra episódios assistidos nem histórico · P-4 título prioriza japonês, kana, inglês · P-5 romaji é preferência · P-6 calendário semanal central, horários no fuso do usuário · P-7 datas/horários desconhecidos não são inventados · P-8 lista de animes ≠ relações sociais · P-9 seguir usuário ≠ acompanhar anime · P-10 a comunidade complementa a agenda · P-11 discussões por obra ou temporada · P-12 spoilers ocultos até ação explícita · P-13 notificações sociais distintas das de lançamento · P-14 identidade visual dark premium sóbria · P-15 sem chat privado, streaming ou grupos privados.

**Prioridade:** P0 bloqueador · P1 alta · P2 média · P3 baixa (definição do roteiro §6).
**Testes:** "Existente" = arquivo real no repositório; "Proposto" = a criar (ver `VALIDATION_PLAN.md`).
**Nós do Figma:** `8:xxxx` = telas do produto (páginas 08–12), `13:xxxxx` = expansão social, `10:x` = componentes nativos.

## 2. Catálogo de requisitos (68)

### 2.1 Catálogo e exploração (CAT)

#### CAT-001 — Explorar e pesquisar animes sem login (kanji, kana, romaji ou inglês; sem duplicar franquia)
- **Tipo / fonte:** RC (P-1) + RF (`8:1606` Busca: "Resultados por kanji, leitura em kana, romaji ou inglês… sem duplicar Season 1 e Season 2"; `8:3` Visitante pode "explorar, pesquisar").
- **Descrição:** qualquer visitante busca por texto e navega por listas de catálogo; a busca devolve a **franquia** uma vez.
- **Observado:** `/discover`, `GET /api/anilist/search`, fallback em `CatalogEntry` quando a AniList cai (TR-001). **Divergência:** resultados por temporada, sem agrupar franquia; campo sem `aria-label`; `q` sem limite; sem rate limit.
- **Decisão pendente (DP):** D-18 (agrupamento por franquia), D-22 (limites).
- **Prio:** P2 · **Dep.:** GAP-S-02
- **Aceite:** buscar "Kusuriya" devolve 1 resultado da franquia; busca por kanji/kana/romaji/inglês encontra a mesma obra; com a AniList indisponível devolve resultados em cache com aviso; `q` > limite → 400; o campo tem nome acessível; sem resultado mostra *Empty* ("Tente kanji, kana, romaji ou inglês", `8:5235`), nunca *Error*.
- **Testes:** Existente: `tests/36-…discover-search-genre-filter`, `tests/11-discover-ownership`. Proposto: queda simulada da AniList; limite de `q`; agrupamento por franquia.

#### CAT-002 — Filtros (gênero, temporada, ano) e "Mais filtros" (tipo, status, disponibilidade de previsão)
- **Tipo / fonte:** RF (`8:1361` Explorar; `8:5720` Modal "Mais filtros": Tipo TV/Movie/OVA/Special, Status, "Disponibilidade de previsão: Todos, incluindo sem data") + OB (taxonomia fechada de 18 gêneros, decisão do Epic 3).
- **Observado:** gênero, status, temporada e ano; `genreTaxonomy.ts` (TR-002). **Divergência:** não há filtro de **Tipo** nem de **disponibilidade de previsão**; o filtro de ano usa `startDate` com mês/dia inventados (`anilist.ts:82-87`) e lê o ano no fuso local.
- **Proposta (PT):** adicionar Tipo e Disponibilidade de previsão; preservar a precisão da data (ano/mês/dia nulos quando ausentes); "Aplicar" mantém o foco no botão "Mais filtros", Esc não aplica (`8:5720`).
- **Prio:** P2 · **Dep.:** GAP-T-05
- **Aceite:** um anime com data de início só "2026" aparece no filtro 2026 em qualquer fuso; nenhuma data é completada com 01; o filtro de Tipo distingue TV/Movie/OVA/Special.
- **Testes:** Existente: `genreTaxonomy.test.ts`. Proposto: unitário de data parcial; filtro de ano em fusos diferentes; modal de filtros (foco/Esc).

#### CAT-003 — Abrir o detalhe de uma obra a partir de qualquer card (inclusive Visitante)
- **Tipo / fonte:** RF (`8:1953`: "Visitante pode ler. Entrar é necessário para publicar, responder, curtir, compartilhar, seguir ou denunciar"; `8:6189` fluxo 04: evento → detalhe da produção) + RC (P-1).
- **Observado:** o card abre `AnimeInfoModal` (limitado) ou, no calendário, o site da AniList; `/anime/[id]` é a linha por usuário e dá **404** a visitante e a não-donos (TR-003).
- **Divergência (DV):** o papel Visitante do Figma não é atendido pela página de detalhe.
- **Decisão pendente (DP):** D-03, D-18.
- **Proposta (PT):** rota pública por produção canônica; o modal passa a ser atalho.
- **Prio:** **P0** · **Dep.:** D-03, D-18, TR-140
- **Aceite:** o detalhe devolve 200 para anônimo com títulos (JP/kana/EN), sinopse, status, próximo episódio, informações, "Site oficial" e discussões; "+ Acompanhar" pede login e **retorna** ao mesmo ponto sem criar o vínculo; produção inexistente → 404 próprio.
- **Testes:** Existente: `tests/05-auth-gating` (hoje fixa o 404 — deverá mudar). Proposto: detalhe público para anônimo; retorno pós-login.

#### CAT-004 — Página de temporada ("Autumn2026": Em exibição; Estreias e datas a confirmar)
- **Tipo / fonte:** RF (`8:1733`: "Sem previsão inventada"; seções "Em exibição" e "Estreias e datas a confirmar"; lista de temporadas).
- **Observado:** fileiras "Em alta" e "Lançamentos da temporada" em `/discover`; `/api/catalog` devolve o catálogo inteiro sem paginação (TR-004). **Divergência:** não há página dedicada nem agrupamento por estado de data.
- **Prio:** P2 · **Dep.:** GAP-T-13
- **Aceite:** a página lista as produções da temporada separando as com data confirmada das "a confirmar"; paginada; produção sem data nunca recebe horário.

### 2.2 Calendário e dashboard (CAL)

#### CAL-001 — Calendário semanal central, com "Todos" e "Minha lista"
- **Tipo / fonte:** RC (P-6) + RF (`8:2106`: toggle "Minha Lista | Todos"; Visitante só "Todos"; `8:6189` fluxo 04).
- **Observado:** `/calendar` com toggle "★ Minha lista / Todos"; visitante vê "Todos" (TR-016/017). **Divergência:** **a semana atual vem vazia em runtime** (TR-011, verificado ao vivo); grade sem régua de horas (TR-010).
- **Prio:** **P0** (dados) · **Dep.:** GAP-T-01
- **Aceite:** com o loader saudável, `GET /api/calendar?weekOffset=0` devolve episódios da semana corrente; o alternador mantém o estado ao trocar de semana; visitante em "Minha Lista" vai ao login **mantendo a semana** (`8:6189`).
- **Testes:** Existente: `tests/43-epic27-calendar-batch2` (semeia dados manualmente). Proposto: teste do loader contra janela real.

#### CAL-002 — Horário no fuso do usuário; padrão America/Sao_Paulo; horário antes de EP
- **Tipo / fonte:** RC (P-6) + RF (`8:2106` "Horários locais em America/Sao_Paulo"; `8:3333` select Timezone; `8:2106`/`8:691` Agenda: "dia/horário → EP → título → estado → acompanhamento").
- **Observado:** horário no fuso do navegador, sem rótulo e sem preferência; exibido depois de "EP n" (TR-012, TR-013).
- **Decisão pendente (DP):** D-07.
- **Aceite:** o horário aparece **antes** do episódio; há rótulo do fuso; a mesma entrada exibe horários diferentes conforme o fuso configurado; o servidor não depende do relógio/fuso do servidor.
- **Prio:** P1 · **Testes:** Proposto: Playwright com `timezoneId` (America/Sao_Paulo, UTC, Asia/Tokyo).

#### CAL-003 — Datas e horários desconhecidos nunca são inventados (estados e painéis fora da grade)
- **Tipo / fonte:** RC (P-7) + RF (`8:2106` painéis "SEM HORÁRIO DEFINIDO" e "DATA NÃO DEFINIDA"; badges `10:21`/`10:22`; `8:6189` "Nunca inventar posição na grade").
- **Observado:** o calendário só lista `airingAt` confirmado; não há estados nem painéis; no catálogo, `fuzzyDateToISO` inventa mês/dia (TR-014).
- **Decisão pendente (DP):** D-25.
- **Aceite:** item sem horário aparece no painel "Sem horário definido" (texto + ícone) e fora da grade; item sem data aparece em "Data não definida"; nenhum campo de data é preenchido com valor inventado.
- **Prio:** P2 · **Dep.:** GAP-T-05, D-25 · **Testes:** Proposto: unitário de data parcial; E2E dos painéis.

#### CAL-004 — Atrasado, Adiado e Cancelado
- **Tipo / fonte:** RC (P-6; roteiro E2) + RF (`8:2106` "ATRASADO" + alerta "Previsão atrasada", "Adiado · nova data a confirmar"; `8:5542` "Cancelado · não ativo"; `8:3603` "Cancelado permanece auditável, nunca como lançamento ativo").
- **Observado:** reagendamento sobrescreve a linha; cancelado/renumerado nunca é removido nem marcado; sem UI desses estados (TR-015). **DV.**
- **Proposta (PT):** reconciliar por janela a cada ingestão (marcar, não apagar) e mostrar o estado.
- **Prio:** P1 · **Dep.:** D-25, GAP-T-04 · **Testes:** Proposto: loader com episódio removido/renumerado/adiado.

#### CAL-005 — Frescor e integridade dos dados do calendário
- **Tipo / fonte:** PT (derivado do P0 verificado; decorre de P-6 e da meta ≤ 2 s de `8:12`).
- **Observado:** o loader roda a cada 30 min mas nunca alcança o presente; `/health` é estático; `fetchedAt` não é atualizado no `update` (TR-011).
- **Aceite:** o health do loader falha (ou alerta) quando `max(airingAt)` < agora + N dias ou quando a paginação é truncada; o truncamento é registrado em log; a UI informa a idade do dado.
- **Prio:** **P0** · **Dep.:** GAP-T-01, GAP-T-08, GAP-Q-06 · **Testes:** Proposto: teste do teto de paginação e do health.

#### CAL-006 — Semana de referência
- **Tipo / fonte:** RF (`8:2106`: colunas SEG 05…DOM 11; `8:6189` "05–11 out") × OB (PoC domingo→sábado).
- **Decisão pendente (DP):** D-08. **Prio:** P2.
- **Aceite:** o calendário abre na semana segunda→domingo; "Hoje" destacado; troca de semana mantém o fuso e o filtro e leva o foco ao cabeçalho do período (`8:6189`).

#### CAL-007 — Dashboard "Seu dia, em anime" (o que sai hoje, ≤ 2 s)
- **Tipo / fonte:** RF (`8:2442`: painéis HOJE / NOVOS EPISÓDIOS / MINHA LISTA, linhas por horário, "Depois de hoje", "Atualizações da sua lista"; acesso pelo **logo**, sem item de menu: `13:41124`, `8:5982`) + RC (P-1, P-6).
- **Observado:** **não existe**; a home é o Feed (TR-020, TR-055). **DV.**
- **Decisão pendente (DP):** D-05. **Prio:** P1 · **Dep.:** CAL-005
- **Aceite:** o autenticado vê os lançamentos de hoje (horário, EP, títulos JP/kana/EN, selo "Novo episódio") em ≤ 2 s; não mostra "0" enquanto carrega nem quando houve erro (`8:5323`, `8:5448`); itens sem data ficam fora da agenda ("Sem data definida: N animes"); o contador "Minha Lista" é de **vínculos**, não de consumo.
- **Testes:** Proposto: E2E do dashboard com semeadura de hoje; estados *loading/error/empty*.

### 2.3 Minha Lista e acompanhamento (LIST)

#### LIST-001 — Acompanhar e remover uma obra (vínculo único por usuário/produção)
- **Tipo / fonte:** RC (P-1) + RF (`8:5982` "Persistir vínculo único por usuário/produção"; `8:5542` "Anime adicionado à sua lista." + "✓ Acompanhando"; `8:5802` "Remover acompanhamento?").
- **Observado:** "Adicionar à lista" (`POST /api/anime`, 409 em duplicata) com popover de plataforma; **remover só existe na API** (TR-030, TR-031). **DV:** vocabulário, atrito e ausência de UI de remoção.
- **Decisão pendente (DP):** D-02 (modelo), D-18 (unidade acompanhada).
- **Aceite:** "+ Acompanhar" cria o vínculo (toast, estado "✓ Acompanhando") e o item aparece em Minha Lista e no calendário "Minha lista"; "Deixar de acompanhar" abre o diálogo "Remover acompanhamento?" (foco inicial em Cancelar; efeito explicado) e remove de ambos; repetir a ação é idempotente; **nunca** marca como assistido.
- **Prio:** P1 · **Testes:** Existente: `tests/27`, `tests/11` (via API). Proposto: remover pela UI; diálogo.

#### LIST-002 — Minha Lista exige login
- **Tipo / fonte:** RF (`8:2106` "Visitante · Minha Lista pede login"; `8:3`).
- **Observado:** tela "Faça login…" com HTTP 200 (TR-032). **Aceite:** anônimo vê o gate; após login retorna a Minha Lista (ver AUTH-003).
- **Prio:** P3 · **Testes:** Existente: `tests/05`.

#### LIST-003 — Lista pessoal distinta das relações sociais; seguir ≠ acompanhar
- **Tipo / fonte:** RC (P-8, P-9) + RF (`13:43227` FollowButton/Perfil ≠ Follow/Anime; `13:41155`).
- **Observado:** `Follow` e `Anime` são separados (TR-035). **DV:** postar e comentar exigem ter a obra na lista (TR-060, TR-066).
- **Decisão pendente (DP):** D-27. **Prio:** P2.
- **Aceite:** seguir uma pessoa nunca cria vínculo com obra e vice-versa; publicar/ler discussão não depende de acompanhar; nenhuma dessas ações publica interesse automaticamente.

#### LIST-004 — Nenhuma métrica de episódios assistidos, progresso de consumo ou histórico
- **Tipo / fonte:** **RC (P-3)** + RF (`8:3`, `8:2608`, `8:4740` "Sem dados de consumo", `8:5802`, `13:41151`, `13:43963` "não existe watchtracking").
- **Observado:** `WatchProgress` (status, `episodeProgress`, `score`, `notes`, `startedAt`, `completedAt`), `ProgressEditor`, `EpisodeGrid.watchedCount`, barra x/y, fileira "Continuar assistindo", `PATCH /api/anime/[id]/progress` (TR-034, TR-037, TR-048). **DV crítica.**
- **Decisão pendente (DP):** D-02 (recomendação em `OPEN_DECISIONS.md`).
- **Prio:** **P0** · **Dep.:** D-02, GAP-T-03
- **Aceite (se D-02 = remover):** nenhuma tela exibe contagem/marcação de episódio assistido nem status de consumo; nenhuma API grava esses campos; testes que fixavam o comportamento (`tests/22`, `25`, `42`, `01`) são revistos; dados existentes têm plano de migração.
- **Testes:** Existente (a rever): os quatro acima. Proposto: ausência dos campos em DTOs e UI.

#### LIST-005 — Organização de Minha Lista (por data de lançamento, busca, ordenação, atalho de discussões)
- **Tipo / fonte:** RF (`8:2608`: "18 ANIMES acompanhando"; grupos por data, "Depois de hoje", "SEM HORÁRIO DEFINIDO", "ADIADO / ATRASADO", "DATA NÃO DEFINIDA"; filtros Busca/Ordenação "Próximo lançamento"/Status; "+ Discussões sobre meus animes").
- **Observado:** hero de 52–62 vh + fileiras por status de consumo + "Todos os animes"; sem busca/ordenação na própria lista (TR-037). **DV.**
- **Decisão pendente (DP):** D-02. **Pendência do Figma:** o filtro "Status" não tem opções desenhadas (FV-08) — risco de reintroduzir status de consumo.
- **Prio:** P1 · **Dep.:** LIST-004
- **Aceite:** a lista agrupa por data de lançamento com os mesmos estados de data do calendário; busca e ordenação por próximo lançamento; o filtro "Status" só existe se definido sem semântica de consumo.

### 2.4 Detalhe da obra e franquias (DET)

#### DET-001 — Conteúdo do detalhe
- **Tipo / fonte:** RC (P-1, P-2) + RF (`8:1953`: chip de status, títulos JP/kana/EN, "PRÓXIMO EPISÓDIO", Sinopse, GÊNEROS, TEMAS/TAGS, Informações, "Site oficial" como único destino externo, "Histórias relacionadas").
- **Observado:** banner, títulos, sinopse (original/PT manual), site oficial, links "onde assistir" manuais, trailer, elenco, episódios, recomendados — hoje só para o dono (TR-040, TR-043, TR-044, TR-047, TR-049). **Divergência:** sem painel "Próximo episódio"; sinopse HTML sem sanitizar (GAP-S-05); sinopse de episódios sem controle de spoiler (TR-048).
- **Prio:** P2 · **Dep.:** CAT-003
- **Aceite:** sem player nem streaming; sinopse sanitizada; "Próximo episódio" com dia · hora · EP (e selo "HOJE" quando for o dia); links externos abrem em nova aba com `rel="noopener noreferrer"`.
- **Testes:** Existente: `tests/42`, `tests/10`. Proposto: sanitização.

#### DET-002 — Hierarquia de título: Japonês → Kana → Inglês; Romaji → Inglês como formato
- **Tipo / fonte:** RC (P-4, P-5) + RF (`8:183`, `8:691`, `8:3333`: "Japonês (kanji+kana+inglês)" padrão; "Romaji (romaji+inglês)" sem kana; "Muda a apresentação dos títulos, não o idioma da interface").
- **Observado:** padrão inglês; sem campo de kana; seletor PT/EN/JP e escrita Romaji/Kanji+furigana/Só kanji; preferência só em `localStorage` (TR-041, TR-042). **DV.**
- **Decisão pendente (DP):** D-06. **Prio:** P1.
- **Aceite:** sem preferência salva, o título principal é o japonês com leitura em kana e inglês de apoio em cards, calendário, dashboard, feed e detalhe; romaji aparece só se escolhido (sem kana); a preferência acompanha a conta.
- **Testes:** Existente: `titlePreference.test.ts` (7), `tests/19`. Proposto: matriz formato × campo ausente; padrão.

#### DET-003 — Franquia → Produção (a temporada pertence à produção)
- **Tipo / fonte:** RC (roteiro E4, §8.1) + RF (`8:3603` "Franchise #101 → Production #501/#502"; `8:4179` "Não criar uma nova franquia com sufixo de temporada"; `13:41925` "Não confundir franquia com temporada ou remake").
- **Observado:** `seriesKey` por regex do título + override por usuário; `relations` da AniList nunca consultadas (TR-045, TR-046). **DV comprovada.**
- **Decisão pendente (DP):** D-18. **Prio:** P1 · **Dep.:** TR-140
- **Aceite:** "Attack on Titan: The Final Season" e "Sword Art Online: Alicization" pertencem à franquia da obra original; a relação vale para todos os usuários; remake/filme exibem subtítulo, tipo e ano próprios; correção manual é auditada.
- **Testes:** Proposto: unitário de `series.ts` com os casos acima (hoje não há teste).

#### DET-004 — Extras do detalhe da PoC sem previsão no Figma
- **Tipo / fonte:** OB (PoC) × RF (`8:1953`: só "Site oficial"/"Histórias relacionadas").
- **Observado:** "Onde assistir" (links manuais), elenco, trailer, lista de episódios com sinopse/miniatura e marca "Já assistido", recomendações da AniList (TR-044, TR-047, TR-048, TR-049).
- **Decisão pendente (DP):** D-29 (manter ou remover); a marca "assistido" segue D-02; a sinopse de episódio segue D-09. **Prio:** P2.

### 2.5 Comunidade, feeds e publicações (SOC, POST, HASH, DISC)

#### SOC-001 — A comunidade complementa a agenda (4º destino; logo → Dashboard)
- **Tipo / fonte:** RC (P-10) + RF (`13:41078` nav EXPLORAR · CALENDÁRIO · MINHA LISTA · COMUNIDADE; `13:41175`; `13:42397` "Nenhum evento de calendário recebe comentários próprios").
- **Observado:** o Feed é a home (TR-055); não há item "Comunidade" (TR-050). **DV.** **DP:** D-05. **Prio:** P1.
- **Aceite:** Explorar, Calendário e Lista permanecem acessíveis em 1 clique de qualquer tela; "Comunidade" é o 4º item; a home autenticada responde "o que sai hoje?" (CAL-007).

#### SOC-002 — Feeds "Para você", "Seguindo" e "Recentes"
- **Tipo / fonte:** RF (`13:41136` contrato; `13:41181`, `13:41417`, `13:41628` telas; `13:43738` estados vazio/primeiro acesso).
- **Contrato do Figma:** *Para você* = sugestões simples por obras/temas declarados, não cronológico, sem ML; sem preferências = "discussões públicas úteis, explicitamente não personalizadas". *Seguindo* = cronológico dos seguidos ("Seguindo usuário" ≠ acompanhar anime). *Recentes* = públicas, mais novas primeiro.
- **Observado:** "Recomendado" (score global igual para todos), "Seguindo" (cursor, cronológico, sem posts próprios); **"Recentes" não existe** (TR-051/052/053). **DP:** D-12.
- **Prio:** P2 · **Testes:** Existente: `feedRanking.test.ts` (4), `tests/14`, `tests/26`. Proposto: ordenação e paginação de cada feed; vazios.
- **Aceite (após D-12):** cada feed tem regra documentada e testável; "Recentes" é cronológico global; "Para você" não é igual para todos e, sem preferências, avisa "Não conhecemos seus interesses ainda"; "Seguindo" vazio conduz à busca de pessoas; paginação "Ver mais conversas".

#### SOC-003 — "Em alta" somente na hashtag
- **Tipo / fonte:** RF (`13:41143` "Em alta existe apenas na hashtag… não uma nova timeline"; `13:42068`; critério e janela pendentes: `13:41172`).
- **Observado:** top 5 do mesmo score global e threads por último comentário/contagem "hoje" (só `Comment`) em laterais (TR-054). **DV:** a PoC tem "em alta" global; o contrato não. **DP:** D-12. **Prio:** P2.
- **Aceite (proposto):** regra com janela e critério explícitos, restrita à página da hashtag (HASH-002).

#### SOC-004 — Busca na Comunidade (publicações, perfis, hashtags + filtro de anime associado)
- **Tipo / fonte:** RF (`13:41181` campo; `13:43738` "Busca social / sem resultados" com abas Publicações|Perfis|Hashtags, "Filtro: Anime associado · Season 2", ações "Limpar busca · Redefinir filtros · Buscar novamente").
- **Observado:** **ausente** (a busca da PoC é de animes) (TR-056). **Pendência do Figma:** sem tela de **resultados** (FV-07). **DP:** D-13. **Prio:** P2.
- **Aceite (proposto):** a busca mantém a query ao trocar de escopo; "reset" remove filtros sem mudar o menu; cada escopo tem estado vazio com o nome correto.

#### SOC-005 — Preservar contexto ao navegar (aba, query, filtros, scroll)
- **Tipo / fonte:** RF (`13:41169`, `13:42257`, `13:44169`).
- **Observado:** estado do feed em `useState`, não restaurado (TR-057, UX-13). **Prio:** P2.
- **Aceite:** voltar do detalhe/perfil/hashtag restaura aba, busca, filtros e posição; voltar **nunca** troca "Para você" por "Seguindo" automaticamente (`13:44169` fluxo D).

#### POST-001 — Publicação com contexto de anime opcional e EXPLÍCITO (produção)
- **Tipo / fonte:** RF (`13:41840` "Anime relacionado — Opcional… mencionar um nome no texto não cria uma associação"; `13:41925` seletor; `13:43227` AnimeContextBadge).
- **Observado:** a obra vem da 1ª `#hashtag` do texto que bate com o romaji de um anime **da lista do autor**; o servidor valida só o `[id]` da rota; exige ter o anime (TR-060, TR-061). **DV.**
- **Decisão pendente (DP):** D-13, D-27. **Prio:** P1.
- **Aceite (proposto):** a publicação pode existir **sem** anime; quando houver, é escolhida num seletor explícito de **produção** (não franquia) para qualquer obra do catálogo; hashtag/menção nunca associa; a API valida a produção; o post exibe o contexto como link.
- **Testes:** Existente: `tests/14`, `tests/40`. Proposto: API com produção inválida → 400; sem anime → 201.

#### POST-002 — Contexto por produção/temporada (nunca por evento de calendário)
- **Tipo / fonte:** RC (P-11) + RF (`13:41925` "A seleção exige uma produção"; `13:42397`; filtro "Anime associado · Season 2").
- **Observado:** `Post.anilistId` (≈ uma temporada); sem `seasonNumber`/`seriesKey` (TR-062). **DP:** D-18, D-23. **Prio:** P2.
- **Pendência do Figma:** não há frame que mostre a escolha "obra inteira × temporada específica" (lacuna em P-11).

#### POST-003 — Respostas (um nível visual; "Em resposta a…"; compositor de resposta)
- **Tipo / fonte:** RF (`13:42257`, `13:45674`, `13:43375` "Resposta / destinatário correto"; fluxo E; "Um nível de resposta visual, provisório").
- **Observado:** `PostComment` plano, leitura pública sem paginação, escrita logada, sem edição/curtida/denúncia/spoiler (TR-063). **Prio:** P2 · **Dep.:** MOD-001, SPOIL-002
- **Aceite (proposto):** resposta paginada; responder a um comentário mostra "Em resposta a …" sem indentação cumulativa; falha mantém texto e destinatário; sucesso ancora a resposta; denunciável; autor notificado conforme NOTIF-002.

#### POST-004 — Exclusão pelo autor (com diálogo e tombstone); edição fora da v1
- **Tipo / fonte:** RF (`13:43571` "Excluir publicação?" / "Publicação removida"; `13:41151`, `13:43571` "Não há edição de posts na V1").
- **Observado:** `DELETE` autor-only com 404 uniforme; sem confirmação; imagens do post removido continuam públicas (TR-065); **sem edição, consistente com o Figma** (TR-064). **Prio:** P2/P3.
- **Aceite:** apagar abre o diálogo de confirmação; o conteúdo some e deixa tombstone neutro (MOD-002); referências internas mostram "indisponível"; os arquivos de mídia são retirados (se mídia permanecer).
- **Testes:** Existente: `tests/09`, `tests/14`.

#### POST-005 — Limites, rascunho, descarte e deduplicação de envio
- **Tipo / fonte:** RF (`13:41840` "Limite de caracteres pendente de definição"; `13:43375` estados do compositor: vazio, digitado, erro de validação, publicando/deduplicação, sucesso, falha com rascunho preservado, "Descartar este rascunho?"; `13:41172` pendências).
- **Observado:** post 500, resposta/comentário 2000, bio 300, 6 imagens, 8 MB; sem limite de hashtags; sem rascunho nem diálogo de descarte; sem deduplicação (TR-069). **DP:** D-13, D-14. **Prio:** P2.
- **Aceite:** "Publicar" desabilita durante o envio e uma solicitação por intenção; falha preserva texto, associação, hashtags e spoiler; cancelar com texto pede confirmação; **não** usar contador de caracteres falso.

#### POST-006 — Mídia e foto de perfil (fora da V1); ShareAction
- **Tipo / fonte:** RF (`13:41151` "V1 não inclui: Mídia"; `13:41840` "Sem anexos"; `13:42736` "Editar perfil altera nome, identificador e bio"; avatares de iniciais).
- **Observado:** upload real, URLs externas arbitrárias e (WT) upload de avatar (TR-067). **DV** com o Figma. **DP:** D-15. **Prio:** P2.

#### POST-007 — Curtir (toggle "Curtido ✓", rollback em falha)
- **Tipo / fonte:** RF (`13:43227` ReactionAction com 7 estados; `13:43963` "Não foi possível curtir… voltaram ao estado anterior"; regra "Somente Curtir, Responder e Compartilhar internamente. Sem SaveAction").
- **Observado:** curtida de post existe; sem curtida de resposta; sem `aria-pressed` verificado (TR-070). **Prio:** P2.
- **Aceite:** a mesma ação desfaz a curtida; `aria-pressed`; falha desfaz o estado otimista e anuncia o erro sem perder o contexto; curtir em comentário existe.

#### POST-008 — "Compartilhar internamente" (ShareAction)
- **Tipo / fonte:** RF (`13:42257` "Compartilhar cria uma referência ao original, não uma cópia do texto"; `13:41181` cartão-citação; `13:43571` "Publicação original indisponível").
- **Observado:** repost puro **e** citação (TR-068). **Pendência do Figma:** o fluxo não é desenhado. **DP:** D-28. **Prio:** P2.
- **Aceite (proposto):** compartilhar cria uma publicação própria com texto e referência; o original removido/bloqueado vira "Publicação original indisponível" sem texto do autor.

#### HASH-001 — Hashtags: normalização, ID canônico e tipos
- **Tipo / fonte:** RF (`13:41840`, `13:42068` normalização; tipos obra/temporada/gênero/tópico em `13:42068` e `13:41181`; "não cria associação de anime": `13:44169`).
- **Observado:** só marcador de obra da lista do autor, regex ASCII (`#DireçãoDeArte` — exemplo do próprio Figma — não funciona), sem tabela/ID canônico/link (TR-071, TR-073, TR-075). **DP:** D-13.
- **Prio:** P2 · **Testes:** Existente: `animeHashtag.test.ts` (16). Proposto: Unicode; ID canônico.
- **Aceite (proposto):** `#Pokémon`, `#DireçãoDeArte` e `#ナルト` são reconhecidas; `#animefall2026` e `#AnimeFall2026` resolvem ao mesmo ID com o nome de exibição preservado; duplicadas colapsam; limite por post definido em D-13.

#### HASH-002 — Página de hashtag (Recentes | Em alta; "Encontre outra conversa")
- **Tipo / fonte:** RF (`13:42068`; fluxo A `13:44169`).
- **Observado:** **ausente** (TR-072, TR-074, TR-075). **Pendência do Figma:** aba "Em alta" não desenhada (FV-07). **DP:** D-12, D-13. **Prio:** P2.
- **Aceite (proposto):** clicar numa hashtag abre a página canônica; "Recentes" é cronológico; "Em alta" segue a regra de D-12; a lateral lista hashtags por tipo; "Obra em contexto" vem do catálogo, não da hashtag.

#### DISC-001 — Discussão por produção: seção no detalhe + página dedicada
- **Tipo / fonte:** RC (P-11) + RF (`13:42397` aba "Discussões" como âncora; "+ Publicar sobre este anime"; "Ver todas as discussões →"; `13:42257` página dedicada; `13:43738` "zero discussões"; fluxos B e C).
- **Observado:** `Comment` por `anilistId`, restrito a quem tem a obra; `Post`+`PostComment` separados (TR-066). **DV.** **DP:** D-23, D-27, D-18. **Prio:** P1.
- **Aceite (proposto):** a página da produção lista discussões, visíveis a visitantes; "Publicar sobre este anime" abre o editor com a produção pré-selecionada e removível, **sem** criar post de acompanhamento; abrir uma discussão usa a página dedicada e "Voltar" restaura a posição da seção.

### 2.6 Perfis, bloqueio, spoilers e moderação (PROF, SPOIL, MOD)

#### PROF-001 — Perfil público (outra pessoa) e perfil próprio
- **Tipo / fonte:** RF (`13:42598` Perfil/Outra pessoa; `13:42736` Perfil/Próprio: "+ Nova publicação", "Editar perfil", "🔒 Abrir Minha Lista privada"; `13:43738`).
- **Observado:** `/users/[id]` público; edição de avatar/bio **(WT, não commitado, sem testes)** (TR-080, TR-081). **Divergência:** avatar por upload (Figma: iniciais); falta editar nome/identificador, atalho "Minha Lista privada" e "+ Nova publicação" (TR-067, TR-081). **DP:** D-15, D-24. **Prio:** P2.
- **Aceite:** o perfil mostra apenas publicações e discussões públicas e **nunca** a lista de animes; `PATCH /api/users/me` devolve 400 para JSON inválido; "Editar perfil" altera nome, identificador e bio (não posts).
- **Testes:** Proposto: spec e2e de bio/identidade; unitário de `processImageUpload` (se o upload permanecer).

#### PROF-002 — Seguir e deixar de seguir ("+ Seguir perfil" ↔ "✓ Seguindo usuário")
- **Tipo / fonte:** RF (`13:43227`; fluxo D `13:44169`; rollback `13:43963`).
- **Observado:** idempotente, unique composto, auto-follow barrado na rota (TR-082). **Prio:** P2.
- **Aceite:** repetir a ação não duplica; falha reverte o botão com mensagem, sem seguir anime nem publicar ação; visitante é levado ao login e retorna ao perfil (AUTH-003).
- **Testes:** Existente: `tests/14`, `tests/17`.

#### PROF-003 — Bloquear e desbloquear perfil (privacidade de perfil a validar)
- **Tipo / fonte:** RF (`13:43571`: "Bloquear @rafamori?", "Este perfil está bloqueado", "Desbloquear…", "Perfil indisponível"; V1 inclui "bloquear": `13:41147`).
- **Observado:** **bloqueio ausente**; perfil sempre público (TR-083, TR-084). **DP:** D-10, D-24. **Prio:** P1 (bloqueio) / P3 (privacidade de perfil).
- **Aceite (proposto):** bloquear (com confirmação) oculta o conteúdo mutuamente e impede interações em feeds, respostas, referências, hashtags e notificações — filtrado **no servidor**; o perfil bloqueado não mostra bio, publicações nem lista; desbloquear não segue automaticamente; mensagem neutra sem revelar motivos.
- **Testes:** Proposto (GAP-Q-11).

#### PROF-004 — Identificador público (@handle) distinto do nome
- **Tipo / fonte:** RF (`13:42598` "@liasato"; `13:42736` "nome, identificador e bio"; `13:43571` "@rafamori").
- **Observado:** **ausente** (TR-085). **DP:** D-24. **Prio:** P2.
- **Aceite (proposto):** identificador único e validado, usado em menção visual, bloqueio e busca de perfis.

#### SPOIL-001 — Spoilers ocultos até ação explícita, em todas as superfícies
- **Tipo / fonte:** **RC (P-12)** + RF (`13:41155`, `13:43079` SpoilerNotice/Reveal, `13:43963` "O mesmo aviso protege os três contextos", fluxo F `13:44298`).
- **Observado:** **ausente** (TR-090); superfícies expostas: post, citação, repost, resposta, lateral pública, thread por anime, perfil, sinopse de episódios, prévia do calendário (WT). **DP:** D-09. **Prio:** P1 (gate de release social).
- **Pendência do Figma (FV-06):** a prévia de resposta no feed e as hashtags ficam fora do bloco; sem variante para busca, citação e bio.
- **Aceite (proposto):** conteúdo marcado chega como placeholder (contexto de obra visível) em feed, anime, comentário, perfil, citação, lateral e prévia; o texto **não existe no DOM** antes da ação; revelar é por item, exige ação explícita acessível por teclado (`aria-expanded`), é anunciado sem vazar o texto e pode ser desfeito ("Ocultar novamente"); abrir thread, clicar no card ou notificação **não** revela; revelar não persiste entre itens.
- **Testes:** Proposto (GAP-Q-11).

#### SPOIL-002 — O autor marca "Contém spoilers" (compositor e resposta)
- **Tipo / fonte:** RF (`13:41840`, `13:41925`, `13:42257` ReplyComposer: "Desmarcado por padrão… não depende de episódios assistidos").
- **Observado:** **ausente** (TR-095). **DP:** D-09. **Prio:** P1.
- **Aceite (proposto):** campo do autor em publicação **e** resposta, desmarcado por padrão; pré-visualização "Como aparecerá no feed"; nenhuma inferência por acompanhamento ou consumo.

#### MOD-001 — Denunciar e moderar (publicação, comentário, perfil; motivos; privada)
- **Tipo / fonte:** RF (`13:43571` motivos; `13:43227` ReportMenu; fluxo G `13:44298`; `13:41133` revisão mínima do Admin).
- **Observado:** denúncia de post e de comentário-por-obra; fila admin manter/remover; `PostComment` e perfil sem denúncia; sem motivo, diálogo, suspensão ou apelação (TR-091…TR-093). **DP:** D-16. **Prio:** P1 (resposta/perfil) / P2 (demais).
- **Aceite (proposto):** toda superfície de conteúdo tem "Denunciar <alvo>" com os 4 motivos; confirmação "Enviar denúncia deste comentário?"; "Denúncia enviada." sem selo público; denunciar duas vezes não duplica; denunciar **não bloqueia** o perfil; o admin remove/mantém e a decisão fica registrada sem expor o denunciante ao autor.
- **Testes:** Existente: `tests/09`, `tests/38`. Proposto: denúncia de resposta e perfil.

#### MOD-002 — Conteúdo removido preserva a referência sem expor o conteúdo (tombstone)
- **Tipo / fonte:** RF (`13:43571` "Publicação removida", "Publicação original indisponível", "Perfil indisponível"; `13:41159`) + roteiro §8.3.
- **Observado:** soft delete protege o conteúdo; **sem placeholder** (TR-094). **DP:** D-16. **Prio:** P2. **Pendência do Figma:** sem tombstone de comentário (FV-07).
- **Aceite (proposto):** citação/referência/notificação de item removido mostram a mensagem neutra, sem texto, imagem, autor ou motivo.

### 2.7 Notificações (NOTIF)

#### NOTIF-001 — Notificação de lançamento (Novo episódio / Data alterada) leva ao detalhe e à próxima data
- **Tipo / fonte:** RC (P-13) + RF (`8:3123`: NOVO EPISÓDIO e DATA ALTERADA com "Antes: …"; `13:42966` "Somente dos animes que você acompanha"; `8:6088` fluxo 03).
- **Observado:** `AiringAlert` para toda obra da lista, janela −30/+5 min, retenção 7 dias; abre `/anime/{id}`; sem "Data alterada", sem próxima data; sem insumo hoje por causa de CAL-005 (TR-100, TR-105). **DV:** documentação do schema diz "favoritos".
- **DP:** D-26. **Prio:** P1.
- **Aceite:** alerta gerado quando o episódio sai e quando a data muda (mostra o horário anterior); clicar abre o detalhe público (CAT-003) e mostra a próxima data; sem duplicidade por (usuário, obra, episódio); o contador do sino reduz sem declarar "assistido".
- **Testes:** Existente: `tests/07`, `tests/27`, `airingWindow.test.ts`. Proposto: dedupe e reagendamento do notifier.

#### NOTIF-002 — Notificações sociais distintas das de lançamento (um sino, dois canais)
- **Tipo / fonte:** RC (P-13) + RF (`13:42872`: abas "Lançamentos · 2 | Social · 3", pílula "2·3"; resposta à publicação, resposta ao comentário, novo seguidor; "Sem trecho da resposta, mesmo quando tem spoilers"; fluxo H).
- **Observado:** **ausentes** (TR-101, TR-102). **DP:** D-11. **Prio:** P2.
- **Aceite (proposto):** resposta/seguidor geram exatamente uma notificação (agregação conforme D-11; curtidas OFF por padrão); o texto nunca traz trecho; clicar abre a discussão **e ancora** a resposta exata (ou o perfil) sem revelar spoiler; destino removido → estado neutro; Esc/clique fora fecha e devolve o foco ao sino.

#### NOTIF-003 — Lida/não lida, "Marcar Social como lido", vazio e desativado
- **Tipo / fonte:** RF (`13:42872`, `13:43227`, `13:43963` "persistir leitura antes de alterar contadores, deduplicar"; `8:5235` "Você está em dia.").
- **Observado:** `seenAt`; sem "marcar todas" por canal; sem estados vazio/desativado do contrato (TR-103). **DP:** D-11. **Prio:** P2/P3.

### 2.8 Autenticação, autorização e privacidade (AUTH)

#### AUTH-001 — Autenticação e proteção contra abuso
- **Tipo / fonte:** RF (`8:2371` login: "Autenticação mínima por email e senha… manter email e mostrar erro"; `8:5448` "Email ou senha inválidos", "não revelar se a conta existe") + OB.
- **Observado:** convite de uso único, scrypt, sessão 256 bits, cookie httpOnly/SameSite=Lax (TR-130); **sem rate limit** (TR-133); **enumeração de e-mails** no cadastro (TR-134); **1ª conta sem convite vira ADMIN** (TR-132). **DP:** D-21, D-22.
- **Prio:** P1 · **Dep.:** GAP-S-01/02/03
- **Aceite (proposto):** login/cadastro com limite por IP/conta; resposta neutra no cadastro; admin inicial criado por CLI/variável; sessões expiradas purgadas; erro preserva o e-mail e move o foco para a mensagem.
- **Testes:** Existente: `tests/06` (convite concorrente), `password.test.ts`. Proposto: expiração de sessão, login/logout, limites.

#### AUTH-002 — Autorização por papel imposta no servidor (Visitante / Autenticado / Admin)
- **Tipo / fonte:** RF (`8:3` tabela de papéis; `13:41123` Mapa de acesso).
- **Observado:** `requireUser`/`requireAdmin` por handler, ownership com 404 uniforme; **sem proteção central** (TR-131). **Divergência:** o Visitante do Figma lê detalhe, discussões, hashtags e perfis; na PoC não alcança o detalhe. **Prio:** P2 · **Dep.:** GAP-Q-02, CAT-003
- **Aceite:** matriz de autorização parametrizada passa para todas as rotas (anônimo, membro dono, membro alheio, admin); rota nova sem checagem falha em teste; as leituras públicas do Figma são explícitas.
- **Testes:** Existente: favorite (`tests/08`), notificações (`tests/07`), delete (`tests/09`, `14`). Proposto: IDOR em progress/title/description/series/anidb/platform-links/refresh/DELETE/GET.

#### AUTH-003 — Preservar destino e intenção após o login
- **Tipo / fonte:** RF (`8:2371` "Após entrar, você volta ao anime que queria acompanhar. O vínculo só é criado quando você confirmar + Acompanhar."; `8:5876`/`8:5982`; `13:43963` "destino e rascunho preservados"; `13:41127`).
- **Observado:** sempre `/` (TR-033). **DP:** D-04. **Prio:** P1.
- **Aceite (proposto):** de qualquer ponto de entrada ("+", Minha Lista, calendário "Minha Lista", publicar, responder, seguir, denunciar, curtir, notificação) o login devolve ao mesmo ponto com rascunho e alvo preservados; a ação **não** é executada sozinha; o destino é validado como caminho relativo (`startsWith("/") && !startsWith("//")`); cancelar o login não perde a origem.
- **Testes:** Proposto: E2E por ponto de entrada.

#### AUTH-004 — A lista pessoal permanece privada
- **Tipo / fonte:** RC (P-8) + RF (`13:41155`, `13:42598`, `13:42736`, `13:42966`).
- **Observado:** rotas/DTOs filtram por usuário; **exceção:** `author.completed` expõe o status COMPLETED de outro usuário (TR-036). **DV.** **Prio:** P1 · **Dep.:** D-02
- **Aceite:** nenhuma resposta de API ou DTO inclui dado derivado da lista de outro usuário; teste automatizado varre os DTOs sociais.

#### AUTH-005 — Contas: cadastro por convite, recuperação de senha, identidade
- **Tipo / fonte:** OB (PoC) — **o Figma só desenha o login** (`8:2371`: "Sem link de cadastro, 'Esqueci a senha'").
- **Observado:** cadastro por convite funciona (TR-130). **Pendência do Figma:** sem telas de cadastro, convite ou recuperação. **DP:** D-31. **Prio:** P2.

### 2.9 Administração e ingestão (ADMIN)

> O Figma define um **produto Admin completo** (9 seções: Dashboard · Catálogo · Importações · Matching · Scrapers · Jobs · Conflitos · Overrides · Logs; nós `8:3436…8:5077`). A PoC tem outro Admin (convites, usuários, denúncias). O recorte da v1 é **D-17**.

#### ADMIN-001 — Importar temporada (colar HTML → prévia → confirmar → commit)
- **Tipo / fonte:** RF (`8:3894`, `8:4020`, `8:5802`, `8:6295`: "HTML → Parse → Normalize → Matching → Prévia → Confirmação → Commit"; "Analisar não faz commit"; "conteúdo tratado como texto, sem executar scripts").
- **Observado:** não há UI/rota de importação; ingestão automática grava direto nas tabelas finais (TR-110). **DP:** D-17, D-30. **Prio:** P2.
- **Aceite (proposto):** "Analisar" não grava; HTML vazio bloqueia o botão com mensagem junto ao campo; falha preserva o HTML; sem autosave; confirmação bloqueada com pendências > 0; dupla confirmação bloqueada.

#### ADMIN-002 — Revisar matching e resolver conflitos
- **Tipo / fonte:** RF (`8:4179` matching ponderado Título/Imagem/Temporada/Ano e "Confirmar · Outro candidato · Ignorar"; `8:4327` conflito de broadcast A×B; `8:6421`).
- **Observado:** matching por 1º resultado de busca sem score/fila; sem conflito (TR-111, TR-112). **DP:** D-17. **Prio:** P2.
- **Aceite (proposto):** o score é ponderado e **não substitui a revisão humana**; confirmar associa a uma Production específica; ignorar registra motivo; resolver exige justificativa e preserva as fontes A e B; "DATA ALTERADA" só é preparada após commit.

#### ADMIN-003 — Auditar (Logs) e confirmar antes de qualquer commit
- **Tipo / fonte:** RF (`8:5077` campos: timestamp, source, jobID, parserVersion, event, message, admin/decision; `8:4020`, `8:5802`).
- **Observado:** sem log de ingestão/override e sem staging (TR-113, TR-114); `/admin` é área separada mas só de moderação/contas (TR-115). **DP:** D-17. **Prio:** P1 (auditar, confirmar).
- **Aceite (proposto):** toda ingestão gera um registro consultável; mudanças de identidade exigem confirmação do admin; UTC só no detalhe técnico com equivalente local.

#### ADMIN-004 — Catálogo (Franquia → Produção; Tipo; Status; Fonte)
- **Tipo / fonte:** RF (`8:3603`).
- **Observado:** **ausente** (TR-118). **DP:** D-18. **Prio:** P1 · **Dep.:** DATA-002
- **Aceite (proposto):** listagem de produções com títulos JP/kana/romaji/EN, tipo (TV/Movie/OVA/Special), status (Finalizado/Em exibição/Adiado/Cancelado/Data desconhecida), fonte (AniDB ou Curadoria) e Production id; cancelado auditável e nunca ativo; **sem edição direta** (mudanças via Importação/Conflitos/Overrides).

#### ADMIN-005 — Scrapers (execução explícita) e política de fontes
- **Tipo / fonte:** RF (`8:4597`, `8:4740` "Scrape · Site oficial") **em conflito** com a regra histórica do projeto "sem scraping".
- **Observado:** nenhum scraping na PoC (TR-116). **DP:** D-30 (**decidir antes de especificar**). **Prio:** P1.
- **Aceite (se aprovado):** serviços independentes; execução sempre cria job e prévia, nunca commit; sem execução duplicada enquanto Running; falha de um não bloqueia os demais; guardas legais (robots, termos, rate limit) definidas.

#### ADMIN-006 — Jobs (fila, estados, dependências, retry)
- **Tipo / fonte:** RF (`8:4740` Pending/Running/Success/Failed/Cancelled; `8:4919` etapas Parse→Normalize→Matching→Commit→Broadcast→Notification; "retry cria novo job"; "Sem dados de consumo").
- **Observado:** **ausente** (TR-119); `calendar-loader` e `notifier` rodam em `setInterval` sem registro. **DP:** D-17. **Prio:** P1 · **Dep.:** CAL-005
- **Aceite (proposto):** cada execução recebe jobID, fonte e timestamp; estados e dependências visíveis ("Pending não equivale a falha"); falha é um job separado; nenhum job mede consumo de usuário.

#### ADMIN-007 — Overrides (apenas BroadcastDate/BroadcastTime) com proveniência
- **Tipo / fonte:** RF (`8:4471`, `8:5802`).
- **Observado:** overrides por usuário em outros campos; sem trilha (TR-117). **DP:** D-17. **Prio:** P2.
- **Aceite (proposto):** override tem original, fonte, valor, admin, data e motivo; **não esconde** o valor original; remover pede confirmação, restaura a origem e registra nos logs.

### 2.10 Configurações, identidade visual, acessibilidade e dados (CFG, VIS, DATA, OPS)

#### CFG-001 — Configurações (formato dos títulos, timezone, tema, notificações)
- **Tipo / fonte:** RF (`8:3333` e `13:42966`: "Formato dos títulos", "Timezone", "Tema: Dark", "Notificações — Lançamentos / Social", "Salvar configurações"; `8:5448` falha de persistência mantém valores; `8:5542` "Configurações salvas.").
- **Observado:** só o menu de idioma/escrita do título (localStorage); sem página, timezone nem preferências (TR-021, TR-104). **DP:** D-06, D-07, D-26. **Prio:** P2.
- **Aceite (proposto):** a página persiste as preferências por conta; "Salvar" desabilita durante o envio; falha mantém os valores e oferece "Salvar novamente" sem mostrar sucesso; "Desativar todo o Social" não altera "Novos episódios e datas alteradas"; acesso por ícone de ajustes/avatar (sem item de menu principal).

#### VIS-001 — Identidade visual (tokens e tipografia)
- **Tipo / fonte:** RC (P-14) + RF (`8:78` 12 tokens; `8:159` "Magenta é a única cor de marca ativa"; `8:183` Inter + Noto Sans JP; `8:269` raios 10/12/16).
- **Observado:** tokens e fontes diferentes (Anton; paleta multicolor; `#e4002b`) (TR-120, TR-121). **DP:** D-20. **Prio:** P2.
- **Aceite (proposto):** os tokens do Figma são a fonte única no tema; Noto Sans JP aplicada a kanji/kana; `lang="ja"` no conteúdo japonês.

#### VIS-002 — Acessibilidade
- **Tipo / fonte:** RF (`8:62`, `13:43375`: AA, foco 2 px, alvos ≥ 44 px, texto+ícone, trap/Esc/retorno ao invocador, `aria-pressed`/`aria-expanded`, live region sem texto protegido, ordem de Tab).
- **Observado:** diálogos/menus do MUI atendem; foco global só em `ButtonBase`; alvos 30–38 px; estados sem ícone; preview só por hover; landmarks incorretos (TR-122…TR-128). **Prio:** P2.
- **Aceite:** auditoria automatizada sem violações AA; navegação completa por teclado na ordem do Figma; alvos ≥ 44 px; todo estado com texto e ícone.
- **Testes:** Proposto: `@axe-core/playwright`.

#### VIS-003 — Dispositivos e larguras
- **Tipo / fonte:** RF (`8:269` "Sem versões mobile"; 1440 referência; `13:41166`/`13:41169` 1280 e 1920 "não validados").
- **Observado:** PoC responsivo; sem `maxWidth` em 1920 (TR-126). **DP:** D-19. **Prio:** P2.

#### VIS-004 — Estados (vazio, carregando, erro, sucesso, proibido, removido)
- **Tipo / fonte:** RF (`8:5235` Empty, `8:5323` Loading, `8:5448` Error, `8:5542` Success; `13:43738`, `13:43963`).
- **Observado:** erro de fetch do Feed vira "vazio"; sem `error.tsx`/`loading.tsx`; sem `aria-busy` (TR-124, UX-04). **Prio:** P2.
- **Aceite:** cada tela distingue vazio de erro (o vazio só aparece após consulta concluída; erro de conexão não vira "0"); skeleton sem animação com `aria-busy`; todo estado com texto e ícone.

#### VIS-005 — Biblioteca de componentes e padrões
- **Tipo / fonte:** RF (`10:2…10:34` 33 componentes; `13:45200` 22 sociais; `8:1222` padrões).
- **Observado:** MUI com tema + componentes próprios; sem mapeamento Figma→código (TR-129). **DP:** D-20. **Prio:** P2.

#### DATA-001 — Fontes de dados legítimas
- **Tipo / fonte:** regra do projeto (não do Figma) **em conflito com** `8:4597` (D-30).
- **Observado:** só APIs públicas; **sem scraping** (TR-116); sem timeout/retry/429; AniDB em HTTP puro. **Prio:** P2 · **Dep.:** GAP-T-07, D-30
- **Aceite:** toda chamada externa tem timeout, retry com backoff e tratamento de 429; a política de fontes de HTML (se houver) está registrada e aprovada.

#### DATA-002 — Modelo canônico Franquia → Produção(Temporada) → Agenda
- **Tipo / fonte:** RC (roteiro §8.1) + RF (`8:3603`, `13:41925`).
- **Observado:** ausente (TR-140). **DP:** D-18. **Prio:** **P0**.

#### OPS-001 — Observabilidade, testes, CI e documentação
- **Observado:** logs só console; health estático; sem CI; README boilerplate; sem testes de Epic 28/29, IDOR amplo, expiração, notifier, fuso, a11y, mobile (TR-142). **Prio:** P2.
- **Aceite:** pipeline mínimo (tipos, lint, unit, e2e); README com execução do zero; health de cada serviço reflete o último ciclo bem-sucedido.

## 3. Resumo por épico (roteiro §7)

Cada épico lista: o que funciona, o que existe parcialmente, o que precisa ser adaptado, criado, o que está em conflito, o que não pôde ser verificado, dependências, prioridade e critérios de aceite propostos (por requisito).
A coluna **Não verificado** não é mais "telas do Figma" (agora inspecionadas); agora lista o que depende de **execução em navegador** e das **pendências declaradas pelo próprio Figma**.

| Épico | Já funciona | Parcial | Adaptar | Criar | Em conflito | Não verificado / pendente | Dependências | Prio | Aceite (ver §2) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **E1 Explorar e pesquisar** | Busca, filtros de gênero/ano/temporada, fileiras, fallback em cache | Abrir detalhe (só modal para visitante); busca por franquia | Rótulo/limite da busca; filtro de ano; agrupamento por franquia | **Detalhe público**; página de temporada; filtros Tipo e previsão | — | Execução ao vivo (E2E não rodado) | D-03, D-18 | P0 (detalhe) / P2 | CAT-001…004 |
| **E2 Calendário** | "Todos"/"Minha lista", "NO AR", preview hover | Fuso, horário vs EP, estados de data | Semana (D-08), régua 00–22 h, preview acessível | **Dashboard "Seu dia"**; painéis "sem horário/data"; reconciliação; Configurações | **Calendário atual vazio** (loader) | 1280/1920 (Figma não valida) | D-05, D-07, D-08, D-25 | **P0** (dados) / P1 | CAL-001…007, CFG-001 |
| **E3 Minha Lista** | Gate de login; separação lista × social | "Acompanhar" (vocabulário/modelo); privacidade (`completed`) | Organização por data de lançamento | UI de remover; destino preservado; busca/ordenação | **Consumo/progresso** (P-3) | Opções do filtro "Status" (FV-08) | D-02, D-04 | **P0** (D-02) / P1 | LIST-001…005, AUTH-003/004 |
| **E4 Detalhe e franquias** | Conteúdo rico (para o dono), site oficial, sinopse PT manual | Título (idioma/escrita), franquia por heurística | Hierarquia JP→kana→EN; sanitização; "Próximo episódio" | Entidades Franquia/Produção; spoiler de episódio | `EpisodeGrid` (consumo + spoiler); extras sem previsão (D-29) | Escolha obra×temporada (P-11) | D-06, D-18, D-09, D-29 | P1 | DET-001…004 |
| **E5 Comunidade e feeds** | "Seguindo"; lateral "em alta" básica | "Recomendado" (global) | Nome/regra de "Para você"; contexto ao voltar | **"Recentes"**; área "Comunidade"; busca social | Feed como home (P-10); "em alta" global | Janela de "Em alta"; resultados da busca (FV-07) | D-05, D-12 | P1 (home) / P2 | SOC-001…005 |
| **E6 Publicações e discussões** | Criar/excluir publicação, respostas planas, curtir, repost/citação | Associação à obra (via hashtag no texto) | Exigência de ter a obra; limites; estados do compositor | Seletor explícito de produção; publicar sem anime; discussão pública; threading | Mídia e avatar (fora da V1); repost puro | Fluxo do ShareAction; limites | D-13, D-15, D-23, D-27, D-28 | P1/P2 | POST-001…008, DISC-001 |
| **E7 Hashtags** | Marcação de obra no compositor, autocomplete | Normalização (ASCII) | Semântica de hashtag | Entidade/ID canônico, página, links, tipos, "em alta" por tag | — | Critério de "Em alta" | D-13, D-12 | P2 | HASH-001/002 |
| **E8 Perfis e relações** | Perfil público, seguir/deixar de seguir | Perfil próprio com avatar/bio **(WT)** | Propagação do avatar; identidade (handle) | **Bloqueio**; @identificador; listas | Avatar por upload (Figma: iniciais) | Visibilidade de seguidores | D-10, D-15, D-24 | P1 (bloqueio) / P2 | PROF-001…004 |
| **E9 Spoilers e moderação** | Denúncia de post e de comentário-por-obra; fila admin; soft delete | Conteúdo removido (protegido, sem placeholder) | Denúncia com motivo | **Spoiler** (autor + superfícies); denúncia de resposta/perfil; tombstone | — | Prévia de resposta e hashtags no feed (FV-06) | D-09, D-16 | P1 | SPOIL-001/002, MOD-001/002 |
| **E10 Notificações** | Sino de lançamento, `seenAt`, dedupe por episódio | Escopo (toda a lista), janela −30/+5 min | Documentação × código; destino/próxima data | **Data alterada**; sociais; canais; preferências | — | Agregação (D-11) | D-11, D-26 | P1 (lançamento) / P2 | NOTIF-001…003 |
| **E11 Admin e ingestão** | Área `/admin` separada (convites, usuários, denúncias); sem scraping | Separação de acesso | — | Catálogo, importação, matching, conflitos, overrides, jobs, logs | **Scrapers × regra "sem scraping"** | Fonte "Site oficial" (FV-09); manual × automático | D-17, D-30 | P1 / P2 | ADMIN-001…007, DATA-001 |
| **E12 Identidade e acessibilidade** | Menus/diálogos do MUI; foco amarelo em botões | Foco global; alvos; estados; fonte JP | Tokens (D-20), landmarks, `lang="ja"` | Biblioteca de estados texto+ícone; mapeamento de componentes | Mobile × desktop-only | Contraste efetivo em runtime | D-19, D-20 | P2 | VIS-001…005 |
| **E13 Autenticação e autorização** | Convite atômico, scrypt, cookie httpOnly, ownership 404 uniforme | Bootstrap do admin; enumeração; headers | Proteção central de rota; papel Visitante | Rate limit; destino preservado | — | Corrida de `upsert` em runtime; telas de conta (D-31) | D-04, D-21, D-22, D-31 | P1 | AUTH-001…005 |

## 4. Contrato de comportamento por tela (roteiro §10)

> **Os contratos abaixo são PROPOSTA (PT)** para validação; "Situação atual" é **comportamento observado** na PoC.
> A "Referência no Figma" agora cita **telas inspecionadas** (estáticas). Endpoints e contratos novos estão marcados **Proposta**; nenhum foi tratado como existente.
> Telas: S-01…S-10 (como na rev.1) + **S-11 Dashboard** e **S-12 Configurações** (novas na rev.2).

### S-01 — Descobrir (Explorar, Busca, Temporada)
- **Identificação:** S-01 · E1 · Figma: `8:1361` Explorar, `8:1606` Busca, `8:1733` Temporada, `8:5720` "Mais filtros" · Rota PoC: `/discover`.
- **Objetivo:** encontrar uma obra e acompanhá-la em ≤ 10 s após autenticar (meta de `8:5982`).
- **Usuário e permissões:** Visitante, Autenticado e Admin exploram e pesquisam; **Acompanhar exige login** com retorno ao mesmo ponto.
- **Dados:** catálogo (AniList com fallback em `CatalogEntry`); `inMyList` do viewer; obrigatórios: título e capa; opcionais: próximo episódio, nota, gêneros.
- **Ações:** buscar (kanji/kana/romaji/inglês); filtrar (gênero, temporada, ano, tipo, status, previsão); abrir detalhe; "+ Acompanhar".
- **Regras:** busca devolve a franquia uma vez; datas parciais nunca completadas; card sem sinopse/tags/plataforma (`8:691`); sem player nem consumo; Acompanhar idempotente.
- **Estados:** inicial; carregando (skeleton sem animação); sucesso; vazio ("Nenhum anime encontrado" + "Limpar filtros"); erro/AniList fora ("mostrando resultados salvos"); desabilitado (enquanto adiciona); sem permissão (login com retorno); capa quebrada → placeholder. Cada estado com texto **e** ícone.
- **Integrações:** AniList, `CatalogEntry`, `cache-updater`.
- **Aceite:** CAT-001…004, LIST-001, AUTH-003.
- **Situação atual:** TR-001…005 funcionam em parte; "+" de visitante vai a `/login` sem destino (TR-033); sem detalhe público (TR-003).

### S-02 — Calendário
- **Identificação:** S-02 · E2 · Figma: `8:2106` (grade SEG→DOM, régua 00–22 h, painéis fora da grade), `8:6189` fluxo 04 · Rota PoC: `/calendar`.
- **Objetivo:** responder "o que sai hoje? quando volta?".
- **Usuário e permissões:** Visitante vê **Todos** ("Minha Lista pede login", mantendo a semana); Autenticado alterna **Minha lista**/Todos; Admin igual.
- **Dados:** `AiringScheduleEntry` (UTC) + vínculos do viewer; obrigatórios: obra, episódio, horário confirmado; opcionais: sinopse, capa.
- **Ações:** trocar de semana; alternar Todos/Minha lista; abrir o detalhe da produção; (se na lista) favoritar.
- **Regras:** horário no fuso configurado e **antes** de "EP"; sem horário/data → painéis fora da grade, nunca inventados; atrasado/adiado/cancelado refletidos (cancelado nunca ativo).
- **Estados:** carregando (skeleton das 7 faixas, sem eventos em horário inventado); sucesso; vazio ("Nenhum lançamento encontrado para este período… Ver Todos"); **dado desatualizado** (idade do cache visível); erro (preserva período e filtro); conteúdo indisponível. Texto + ícone.
- **Integrações:** `calendar-loader` → `AiringScheduleEntry`; AniList.
- **Aceite:** CAL-001…006.
- **Situação atual:** **calendário atual vazio** (TR-011, verificado ao vivo); semana Dom→Sáb; fuso do navegador sem rótulo; "EP n · hora"; preview só por hover.

### S-03 — Minha Lista
- **Identificação:** S-03 · E3 · Figma: `8:2608`, `8:5235` (vazio), `8:5802` (remover) · Rota PoC: `/minha-lista`.
- **Objetivo:** ver e gerir as obras acompanhadas **sem** métrica de consumo.
- **Usuário e permissões:** só Autenticado (Visitante vê o gate); lista **privada**.
- **Dados:** vínculos do usuário com produções; favorito; links externos opcionais.
- **Ações:** Acompanhar/deixar de acompanhar (com diálogo); abrir detalhe; buscar/ordenar; "+ Discussões sobre meus animes".
- **Regras:** agrupada por data de lançamento com os estados de data; **nenhum** contador de episódio, status de consumo, nota ou "Continuar assistindo" (P-3); privada.
- **Estados:** vazio ("Você ainda não está acompanhando nenhum anime" + "EXPLORAR ANIMES"); carregando; erro; sem permissão (gate com retorno).
- **Integrações:** modelo de acompanhamento (D-18); notificações.
- **Aceite:** LIST-001…005, AUTH-003/004.
- **Situação atual:** organizada por status de consumo (`WatchProgress`), hero decorativo, **sem UI para remover** (TR-031, TR-034, TR-037).

### S-04 — Detalhe da produção
- **Identificação:** S-04 · E4 · Figma: `8:1953`, `13:42397` (com Discussões) · Rota PoC: `/anime/[id]` (per-user). **Proposta:** rota pública por produção.
- **Objetivo:** entender a obra, sua data/horário e decidir acompanhar.
- **Usuário e permissões:** **Visitante inclusive**; ações pessoais (acompanhar) exigem login.
- **Dados:** títulos JP/kana/EN, sinopse, gêneros, temas/tags, status, próximo episódio, informações (tipo, temporada, ano, episódios, estreia, horário, produção, franquia), site oficial, relacionadas, discussões.
- **Ações:** acompanhar; abrir site oficial; "Publicar sobre este anime"; "Ver todas as discussões →"; abas Visão geral / Discussões (âncora).
- **Regras:** sem player; sinopse sanitizada; spoilers ocultos; sem métrica de episódios assistidos; "Entre para criar sua agenda" só para visitante (FV-04).
- **Estados:** carregando; sucesso; sem sinopse; erro (mantém a obra); produção inexistente (404 próprio); zero discussões; Texto + ícone.
- **Integrações:** catálogo canônico (D-18), AniList/Kitsu/AniDB, agenda.
- **Aceite:** CAT-003, DET-001…004, DISC-001, SPOIL-001.
- **Situação atual:** conteúdo rico mas **só para o dono**; 404 para visitante (TR-003, TR-040); franquia por regex (TR-045/046).

### S-05 — Comunidade / Feeds
- **Identificação:** S-05 · E5 · Figma: `13:41181` Para você, `13:41417` Seguindo, `13:41628` Recentes, `13:43738` estados · Rota PoC: `/` (Feed). **Proposta:** rota própria + item de menu.
- **Objetivo:** ver o que a comunidade diz sobre as obras, **sem substituir** a agenda.
- **Usuário e permissões:** leitura pública; publicar/curtir/seguir exigem login.
- **Dados:** publicações (produção opcional, texto, spoiler, autor, contadores, hashtags), seguidos.
- **Ações:** alternar abas; buscar; abrir hashtag/discussão/produção/perfil; curtir; responder; denunciar; "Compartilhar internamente"; "Ver mais conversas".
- **Regras:** regra documentada por feed (D-12); spoiler como placeholder; bloqueios filtrados no servidor; lateral "Também na sua agenda" sem expor a lista.
- **Estados:** carregando (skeleton); vazio por feed; **erro distinto de vazio**; tombstone; sem permissão.
- **Integrações:** feeds, hashtags, moderação.
- **Aceite:** SOC-001…005, SPOIL-001, PROF-003.
- **Situação atual:** "Recomendado" (global) e "Seguindo"; sem "Recentes"; Feed é a home; erro de fetch aparece como "vazio" (TR-050…057, UX-04).

### S-06 — Publicação, resposta, hashtag e discussão
- **Identificação:** S-06 · E6/E7 · Figma: `13:41840`, `13:41925`, `13:42068`, `13:42257`, `13:43375`, `13:43227` · PoC: compositor em `FeedView`, `PostCard`, comentários.
- **Objetivo:** publicar uma opinião (com ou sem obra) e discuti-la.
- **Usuário e permissões:** autenticado publica/responde/exclui o próprio; visitante lê.
- **Dados:** corpo (limite D-13), produção (opcional, seletor explícito), spoiler (marca), hashtags canônicas.
- **Ações:** publicar; marcar spoiler; responder (um nível); excluir (com confirmação); denunciar; abrir hashtag; descartar rascunho.
- **Regras:** produção opcional e validada no servidor; hashtags normalizadas (Unicode; ID canônico; máx. definido); sem edição na v1; sem mídia.
- **Estados:** vazio (Publicar desativado); digitado; erro de validação inline; publicando/dedup; sucesso; falha com rascunho preservado; limite excedido; conteúdo removido; sem permissão (login com rascunho preservado).
- **Integrações:** modelo de publicação, hashtags, moderação, notificações sociais.
- **Aceite:** POST-001…008, HASH-001/002, DISC-001, SPOIL-002.
- **Situação atual:** obra por hashtag no texto, só da lista do autor; respostas planas sem denúncia; sem edição (conforme); hashtag e chip não clicáveis (TR-060…075).

### S-07 — Perfil
- **Identificação:** S-07 · E8 · Figma: `13:42598`, `13:42736`, `13:43571` (bloqueio) · Rota PoC: `/users/[id]`.
- **Objetivo:** apresentar uma pessoa e permitir seguir/gerir o próprio perfil.
- **Usuário e permissões:** perfil público; edição só no próprio; seguir/bloquear/denunciar exigem login.
- **Dados:** nome, @identificador, bio, avatar de iniciais, contadores, publicações; **nunca** lista de animes, progresso, e-mail ou papel.
- **Ações:** seguir/deixar de seguir; "Denunciar / bloquear"; "+ Nova publicação" e "Editar perfil" (próprio); "🔒 Abrir Minha Lista privada" (próprio).
- **Regras:** bio ≤ limite; bloqueado vê "Perfil indisponível"; favoritos públicos fora da V1.
- **Estados:** carregando; indisponível/bloqueado; sem publicações; erro.
- **Integrações:** `Follow`, `Block` (proposto).
- **Aceite:** PROF-001…004.
- **Situação atual:** perfil público e edição de avatar/bio **(WT, não commitado, sem testes)**; sem bloqueio; sem @identificador; sem listas (TR-080…086).

### S-08 — Notificações (sino)
- **Identificação:** S-08 · E10 · Figma: `8:3123`, `13:42872` · PoC: `NotificationBell`.
- **Objetivo:** levar ao detalhe e à próxima data; separar lançamento de eventos sociais no mesmo sino.
- **Usuário e permissões:** autenticado, apenas as próprias.
- **Dados:** lançamento (obra, episódio, horário, horário anterior) e social (tipo, ator, alvo); lida/não lida.
- **Ações:** abrir (marca como lida), "Marcar Social como lido", "Configurar Social".
- **Regras:** dois canais permanentes; sem texto de spoiler; dedupe por evento; destino exato com âncora; Esc devolve o foco ao sino.
- **Estados:** vazio ("Você está em dia."); desativado; carregando; erro; destino indisponível.
- **Integrações:** `notifier`, eventos sociais (proposta), preferências.
- **Aceite:** NOTIF-001…003.
- **Situação atual:** só "no ar agora" para toda a lista; sem sociais; sem preferências; item vira texto sem link se a obra saiu da lista (TR-100…105).

### S-09 — Administração (9 seções)
- **Identificação:** S-09 · E11 · Figma: `8:3436…8:5077` · Rota PoC: `/admin`.
- **Objetivo:** manter dados e comunidade íntegros, com auditoria e confirmação.
- **Usuário e permissões:** só Admin; área separada.
- **Dados:** produções, importações, candidatos de matching, conflitos, overrides, jobs, logs; (PoC) convites, usuários, denúncias.
- **Ações:** importar (colar HTML → analisar); confirmar/outro/ignorar; usar fonte A/B/definir; remover override; executar scraper (D-30); ver logs; moderar; gerar convites.
- **Regras:** **nada é salvo antes da confirmação**; toda ação deixa trilha; conflito com pendências bloqueia o commit; sem dados de consumo.
- **Estados:** vazio ("Nenhum conflito pendente"); carregando ("Carregando prévia · nenhuma alteração salva"); erro (JobID/fonte/HTTP/parserVersion/timestamp; HTML preservado); sem permissão (404 hoje).
- **Integrações:** pipeline de ingestão, moderação, sessões.
- **Aceite:** ADMIN-001…007, MOD-001.
- **Situação atual:** só convites, usuários e filas de denúncia; **nenhuma** das capacidades de dados do Figma (TR-110…119).

### S-10 — Login e cadastro
- **Identificação:** S-10 · E13 · Figma: `8:2371` (login), `8:5448` (erro) · Rotas PoC: `/login`, `/signup`.
- **Objetivo:** autenticar preservando o contexto.
- **Usuário e permissões:** Visitante; cadastro por convite (PoC); 1ª conta fora do fluxo normal (D-21).
- **Dados:** e-mail, senha, (cadastro) nome e código de convite, **destino** (relativo, validado).
- **Ações:** entrar; (PoC) cadastrar; sair.
- **Regras:** rate limit; resposta neutra; destino validado contra open redirect; sem login social.
- **Estados:** carregando ("Entrando…"); erro de credencial (preserva e-mail; foco na mensagem); convite inválido/expirado; limite excedido.
- **Integrações:** sessão, convites.
- **Aceite:** AUTH-001…003, AUTH-005.
- **Situação atual:** sempre redireciona a `/`; cadastro revela e-mails existentes; sem rate limit (TR-033, TR-133, TR-134). O Figma não desenha cadastro nem recuperação (D-31).

### S-11 — Dashboard "Seu dia, em anime" *(nova na rev.2)*
- **Identificação:** S-11 · E2 · Figma: `8:2442` · Rota PoC: **não existe** (a home é o Feed). **Proposta:** acesso pelo logo.
- **Objetivo:** responder "o que lança hoje da minha lista e qual é o próximo horário" em ≤ 2 s.
- **Usuário e permissões:** só Autenticado (visitante usa Explorar).
- **Dados:** lançamentos de hoje e "Depois de hoje"; alertas da lista; contadores (hoje, novos episódios, vínculos).
- **Ações:** "Abrir calendário"; abrir o detalhe de um evento; "Ver Minha Lista".
- **Regras:** horário local antes de EP; itens sem data ficam fora da agenda; contador não vira "0" em erro; sem feed social.
- **Estados:** carregando (blocos de contagem + linhas); erro ("Não foi possível carregar os lançamentos… TENTAR NOVAMENTE"); vazio; Texto + ícone.
- **Aceite:** CAL-007.
- **Situação atual:** **ausente** (TR-020).

### S-12 — Configurações *(nova na rev.2)*
- **Identificação:** S-12 · E2/E10 · Figma: `8:3333`, `13:42966`, `8:5448`, `8:5542` · Rota PoC: **não existe** (só menu de título).
- **Objetivo:** ajustar formato dos títulos, fuso, tema e notificações.
- **Usuário e permissões:** só Autenticado; acesso por ícone de ajustes/avatar.
- **Dados:** formato dos títulos (Japonês | Romaji), timezone, tema (Dark), notificações de Lançamentos e de Social (4 toggles).
- **Ações:** salvar; "Desativar todo o Social".
- **Regras:** o formato muda a apresentação, não o idioma da interface; desativar o Social não altera Lançamentos; curtidas desativadas por padrão.
- **Estados:** salvando (botão desabilitado); sucesso ("Configurações salvas."); falha (mantém valores; "Salvar novamente"); Texto + ícone.
- **Aceite:** CFG-001.
- **Situação atual:** **ausente** (TR-021, TR-104).

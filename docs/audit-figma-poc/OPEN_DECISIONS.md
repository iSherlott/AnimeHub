# OPEN_DECISIONS — Decisões que exigem aprovação do responsável pelo ANIME HUB (rev.2)

> Auditoria de 2026-10-08, **revisão 2**. **Nenhuma recomendação abaixo é requisito aprovado.** Toda "Recomendação da equipe" é uma
> **Proposta** para o responsável decidir. Com o Figma completo inspecionado, cada decisão agora traz a **posição do Figma**:
> o design *já toma posição* em várias delas ("Decidido no Figma — confirmar"); outras o próprio Figma declara pendentes
> (`13:41172`); e há conflitos novos (escopo, scraping, avatar). Que o Figma tenha tomado posição **não é aprovação do produto**:
> o responsável precisa confirmar. Prioridade segue a escala P0–P3 do roteiro (P0 = bloqueia validar a especificação).

## Registro de aprovações do responsável pelo produto

| Data | Decisão | Aprovação | Observação |
| --- | --- | --- | --- |
| 2026-10-09 | **D-02** remover o rastreamento de consumo | **Aprovada** ("confirmo remover consumo") | O **plano de migração dos dados** (converter vínculos, arquivar campos de consumo, revisar os specs `tests/22`, `25`, `42`, `01`) ainda **não** foi aprovado — a aprovar antes da fatia F4 |
| 2026-10-09 | **D-03** detalhe público de obra | **Aprovada** | — |
| 2026-10-09 | **D-18** modelo canônico Franquia → Produção | **Aprovada** | Mapeamento AniList/AniDB → Production e plano de migração do `Anime` por usuário a detalhar em F2 |

Aprovar decisões **não** autoriza implementação: nenhuma fatia do roadmap foi autorizada.

## 0. O que mudou desde a rev.1

- **D-01 (fonte completa do Figma) está RESOLVIDA**: o responsável enviou os links de todas as páginas e o Figma foi inspecionado integralmente (`FIGMA_INVENTORY.md`).
- 22 das 30 decisões abertas têm **posição do Figma** (16 "decididas no Figma — confirmar" e 6 com lacunas): a pergunta agora é concordar, adaptar ou divergir.
- 4 decisões novas: **D-28** (ShareAction), **D-29** (extras do detalhe), **D-30** (política de scraping), **D-31** (contas: cadastro/convite/recuperação). **D-02** passa a incluir a aprovação do *plano de migração*; **D-14**, **D-22** e **D-24** continuam pendentes no próprio Figma.
- Total: **31 decisões** (1 resolvida + 30 abertas ou a confirmar).

## 1. Resumo (ordenado por prioridade)

Legenda — **Posição do Figma:** `DF` = decidido no Figma (confirmar) · `PF` = pendente no próprio Figma · `NF` = o Figma é omisso/contraditório (decisão nova).

| ID | Pergunta objetiva | Prio | Figma | Bloqueia |
| --- | --- | --- | --- | --- |
| ~~D-01~~ | ~~O arquivo Figma é o final? Onde estão as páginas 02–17?~~ | — | **RESOLVIDA** (links recebidos; 17 páginas inspecionadas) | — |
| D-02 | **APROVADA (2026-10-09)** — Remover o rastreamento de episódios/consumo da PoC — e com qual plano de migração dos dados existentes? | **P0** | DF (proíbe: `8:3`, `8:4740`, `8:5802`, `13:41151`) | TR-030/034/036/037/048; Minha Lista; notificações |
| D-03 | **APROVADA (2026-10-09)** — Detalhe público de obra, independente da lista do usuário? | **P0** | DF (sim: `8:1953`, `13:42397`) | TR-003, FL-03, E4, ler antes de acompanhar |
| D-18 | **APROVADA (2026-10-09)** — Modelo canônico Franquia → Produção(Temporada) → Agenda; unidade de "acompanhar" e de "discutir" | **P0** | DF (Franchise→Production: `8:3603`; discussão por produção: `13:41925`) | TR-140/045/046/062/066/118; migração |
| D-04 | Alcance de "preservar destino e intenção" após o login | P1 | DF parcial / ambíguo (`8:5876` × `8:5982`) | TR-033; FL-09/10 |
| D-05 | Home = Dashboard (via logo) / Explorar (visitante); Feed fica em "Comunidade"? | P1 | DF (`13:41124`, `8:2442`) | TR-020/050/055 |
| D-06 | Hierarquia de título (Japonês → Kana → Inglês), origem do kana, onde vive a preferência | P1 | DF (padrão Japonês: `8:183`, `8:3333`) | TR-041/042/121 |
| D-07 | Fuso padrão America/Sao_Paulo, configurável, com rótulo | P1 | DF (`8:3333`, `8:2106`) | TR-012 |
| D-09 | Spoiler: quem marca, onde, default, superfícies | P1 | DF (autor marca; default desmarcado: `13:41840`) + lacunas FV-06 | TR-090/095/048; gate de release social |
| D-10 | Semântica de bloqueio | P1 | DF parcial (`13:43571`) | TR-083; gate social |
| D-16 | Escopo de denúncia/moderação | P1 | DF (motivos e alvos: `13:43571`) | TR-091/092/093/094 |
| D-17 | Escopo da área Admin de dados (importar, matching, conflitos, overrides, jobs, logs) | P1 | DF (9 seções: `8:3436…8:5077`) | TR-110…TR-119 |
| D-21 | Como nasce o primeiro administrador | P1 | NF | TR-132 |
| D-22 | Limites anti-abuso e retenção | P1 | PF (rate limits sem número: `13:41172`) | TR-133/134/136 |
| D-26 | Notificação de lançamento: escopo, antecedência, preferências | P1 | DF ("só dos animes que você acompanha": `13:42966`) | TR-100/104 |
| D-27 | Publicar/comentar exige acompanhar a obra? | P1 | DF (não exige: `13:41840`, `13:43227`) | TR-035/060/066 |
| D-30 | **Política de scraping** (Figma especifica Scrapers; regra do projeto proíbe) | P1 | **Conflito** (`8:4597` × regra) | TR-110/116; FL-13/14; legal |
| D-08 | Semana começa na segunda ou no domingo? | P2 | DF (segunda: `8:2106`) | TR-010 |
| D-11 | Notificações sociais: agregação e retenção | P2 | DF eventos / PF agregação (`13:41172`) | TR-101/102/103 |
| D-12 | Regra de "Para você", "Recentes" e "Em alta" | P2 | DF contrato / PF política e janela | TR-051/053/054/072/074 |
| D-13 | Limites de texto/hashtags e semântica de hashtag | P2 | DF semântica / PF limites | TR-069/071/072/073 |
| D-15 | Mídia, avatar por upload, repost puro e citação na v1 | P2 | DF (fora da V1) × PoC | TR-067/068/136 |
| D-19 | Desktop-only ou mantém mobile? | P2 | DF (sem mobile; 1280/1920 não validados) | TR-126 |
| D-20 | Tokens/tipografia: Figma como fonte única? | P2 | DF (tokens; Noto Sans JP) | TR-120/121/127/129 |
| D-23 | Discussão e comentário viram um modelo único? | P2 | DF implícito (`13:42257`) | TR-062/063/066 |
| D-25 | Horário a confirmar, adiado, cancelado | P2 | DF (`8:5542`, `8:2106`) | TR-014/015 |
| D-28 | **ShareAction** ("Compartilhar internamente"): citação com texto, repost puro ou ambos? | P2 | NF (sem fluxo desenhado) | TR-068 |
| D-29 | **Extras do detalhe da PoC** (Onde assistir, elenco, trailer, lista de episódios, recomendações AniList) permanecem? | P2 | NF (não previstos) | TR-040/044/047/048/049 |
| D-31 | **Contas**: cadastro por convite, recuperação de senha, perfil (nome/identificador) | P2 | NF (só login: `8:2371`) | TR-130/085 |
| D-14 | Rascunhos persistem? Por quanto tempo? | P3 | PF (`13:41172`) | TR-069 |
| D-24 | Perfil: visibilidade de seguidores, listas, privacidade | P3 | PF (`13:42598`) | TR-080/084/086 |

Contagem: **P0 = 3 abertas** (D-02, D-03, D-18) + D-01 resolvida; **P1 = 13**; **P2 = 12**; **P3 = 2** → 30 abertas + 1 resolvida = 31.
Por posição do Figma (30 abertas): DF puro = 16 · DF com lacunas/PF parcial = 6 (D-04, D-09, D-10, D-11, D-12, D-13) · PF = 3 (D-14, D-22, D-24) · NF = 4 (D-21, D-28, D-29, D-31) · Conflito = 1 (D-30).

## 2. Verificação explícita das cinco decisões que o relatório do Figma deu como pendentes

O Figma as lista literalmente em `13:41172` ("Pendências de produto — não são limites aprovados"): *"Caracteres, mídia futura, quantidade/tamanho de hashtags e rate limits: sem números definitivos. Ainda validar normalização, agregação de notificações, políticas de recomendação e Em alta, visibilidade de seguidores, retenção de rascunhos e edição futura. Um nível de resposta é uma decisão provisória."*

| Decisão pendente | Continua pendente? | A PoC já define "de fato"? | Contradição entre documentos? | Evidência |
| --- | --- | --- | --- | --- |
| Limites de texto e hashtags | **Sim** (Figma: "pendente de definição · sem contador definitivo": `13:41840`) | Sim, sem aprovação: post 500; resposta 2000; comentário de anime 2000; bio 300; 6 imagens; upload 8 MB; **sem limite de hashtags**; `displayName` sem limite | O Figma proíbe "contagem falsa de caracteres" (`13:43375`); a PoC tem contador/limite | `anime/[id]/posts/route.ts:10-11`; `posts/[postId]/comments/route.ts:95`; `users/me/route.ts:9`; `animeHashtag.ts:8` |
| Recomendação "Para você" | **Sim** (política) — mas o *contrato* está definido: sugestões simples por obras/temas declarados, sem ML (`13:41137`) | Não existe "Para você": a aba "Recomendado" é score global igual para todos | O nome promete personalização que o código não faz; "interesses declarados" não existe no produto | `feedRanking.ts:7-23`; `feedRecommended.ts:12-60` |
| Regra de "Em alta" | **Sim** (janela e critério pendentes) — contrato: só na hashtag, não é timeline (`13:41143`, `13:42068`) | Heurística global (top 5 do mesmo score; threads só por `Comment`); nada por hashtag | A PoC tem "em alta" global que o contrato não prevê | `trending-posts/route.ts:99-114`; `anime-threads/trending/route.ts:86-106` |
| Agregação de notificações | **Sim** (`13:41172`; nota "deduplicar eventos") | Só lançamento: 1 alerta por (usuário, anime, episódio); retenção 7 dias; janela 35 min. Social: não existe | Comentário do schema diz "favoritos"; o notifier notifica toda obra da lista — o Figma diz "só dos animes que você acompanha" (**coerente com o código**; a doc do schema é que está velha) | `schema.prisma:366`; `notifier/src/index.ts:32-35,52-62,79-82` |
| Retenção de rascunhos | **Sim** | Não existe rascunho persistente (`useState`); imagens anexadas sobem na hora e ficam órfãs | O Figma exige "rascunho preservado" em erro e login (`13:43375`, `13:43963`) | `FeedView.tsx:73,406-420` |

**Fora da primeira versão social — o Figma e o código contradizem?** (agora verificado nos frames)

| Item | Figma | Contradiz a PoC? | Evidência |
| --- | --- | --- | --- |
| Mídia | Fora da V1 ("Sem anexos": `13:41151`, `13:41840`); só avatares de iniciais | **Sim** — upload real, URL externa e (WT) upload de avatar | `api/uploads/route.ts`; `AvatarUploader.tsx` (WT) |
| Publicações salvas | Fora da V1 ("Sem SaveAction": `13:43227`) | Não | grep saved/bookmark sem rota/modelo |
| Edição de publicações | Fora da V1 ("Não há edição de posts na V1": `13:43571`) | Não — só `DELETE` | `api/posts/[postId]/route.ts` |
| Chat privado, DMs, streaming, grupos privados | Fora (`13:41151`) | Não | nenhum modelo/rota |
| Repost e citação | Existe "Compartilhar internamente" = referência com texto próprio (`13:42257`, `13:43571`) — o fluxo não é desenhado | A PoC tem repost puro **e** citação | `api/posts/[postId]/repost/route.ts` → D-28 |
| Design (Figma) | Inspecionado integralmente (rev.2) | — | `FIGMA_INVENTORY.md` |

## 3. Conflitos entre requisitos, documentos e implementação

| ID | Conflito | Fontes | Decisão necessária |
| --- | --- | --- | --- |
| C-1 | "Não registra episódios assistidos nem histórico" × tracker de consumo completo na PoC (e `author.completed` publicado a terceiros) | Princípio 3 + Figma `8:3`/`8:4740`/`8:5802`/`13:41151` × `WatchProgress`, `ProgressEditor`, `EpisodeGrid`, `comments/route.ts:65-89` | D-02 |
| C-2 | Figma "sem telas mobile" × PoC responsiva com testes mobile | Figma `8:269` × `Header.tsx:240-276`, `tests/16`, `tests/20` | D-19 |
| C-3 | Semana "05–11 out" (segunda→domingo) × calendário domingo→sábado | Figma `8:2106`, `8:6189` × `calendar/page.tsx:28-38` | D-08 |
| C-4 | "Mídia fora da v1" × upload e URLs externas implementados | Figma `13:41151` × Epic 26 | D-15 |
| C-5 | Título principal Japonês→Kana→Inglês × padrão inglês e nenhum campo de kana | Figma `8:183`/`8:3333` × `titlePreference.tsx:29-32` | D-06 |
| C-6 | "Comunidade complementa a agenda"; logo → Dashboard × Feed como home e sem Dashboard | Figma `13:41124`, `13:41175`, `8:2442` × `app/page.tsx:7-19` | D-05 |
| C-7 | "Seguir ≠ acompanhar" e publicar com contexto opcional × publicar e comentar exigem acompanhar a obra | Figma `13:41840`, `13:43227` × `anime/[id]/posts/route.ts:34`, `comments/route.ts:19-26` | D-27 |
| C-8 | Documentação do notifier ("favoritos") × código (toda obra da lista) × Figma ("animes que você acompanha") | `schema.prisma:350-355` × `notifier/src/index.ts:32-35` × Figma `13:42966` | D-26 |
| C-9 | Figma "hoje = sábado 10/10/2026" × data real do sistema (08/10/2026) | Figma (dados ilustrativos, declarado) | Nenhuma: tratar a data do Figma como ilustrativa |
| C-10 | ~~Relatório diz "design system nativo preservado" × zero componentes~~ | **Resolvido na rev.2:** o arquivo tem 33 componentes do produto + 22 sociais (`FIGMA_INVENTORY.md` §5) | — |
| C-11 | **Scrapers** de HTML (AniDB, "Site oficial") no Admin × regra histórica do projeto "só APIs legítimas, sem scraping" × PoC só com APIs | Figma `8:4597`, `8:4740`, `8:3894` × regra de projeto | **D-30** |
| C-12 | **Foto de perfil por upload** (Epic 28, WT) × Figma só com avatar de iniciais e "Editar perfil = nome, identificador e bio" | `AvatarUploader.tsx` (WT) × `13:42736` | D-15 |
| C-13 | **Repost puro** (PoC) × "Compartilhar internamente" = referência com texto próprio (Figma) | `api/posts/[postId]/repost/route.ts` × `13:42257`, `13:43571` | D-28 |
| C-14 | **Importação por HTML colado** (`8:3894`) × **botão "Executar" e HTTP 500 na obtenção do HTML** (`8:4597`, `8:4919`): o Figma é interno-inconsistente sobre se a obtenção é manual ou automática | Figma | D-30 |
| C-15 | Login "volta ao anime… o vínculo só é criado ao confirmar" (`8:2371`) × "voltar à intenção" (`8:5982`): intenção restaurada, ação **não** auto-executada | Figma | D-04 |

## 4. Fichas das decisões

### D-01 — Fonte completa do Figma — **RESOLVIDA**
- O responsável enviou os links com `node-id` de todas as páginas (`0-1`, `8-78`, `10-36…10-45`, `13-44907…13-44911`). A rev.1 estava errada ao concluir que só existia a página 01 (causa: o conector lista apenas a primeira página sem `node-id`). Detalhes em `FIGMA_INVENTORY.md` §1.

### D-02 — Consumo e progresso de episódios (P0) — Figma: **DF** (proíbe) — **APROVADA em 2026-10-09 (remover); plano de migração pendente de aprovação**
- **Pergunta (reduzida):** confirmar a remoção de `episodeProgress`, status de consumo (Assistindo/Completo/Pausado/Abandonado), `score`, `notes`, `startedAt/completedAt`, o contador "x/y eps", a marcação "Já assistido", a fileira "Continuar assistindo" e `author.completed` — e **aprovar o plano de migração** dos dados dos usuários existentes.
- **Contexto:** o Figma proíbe em 6 telas ("Acompanhar não registra episódios assistidos": `8:3`, `8:2608`; "Sem dados de consumo": `8:4740`; "não há tracking de consumo": `8:5802`; "V1 não inclui progresso assistido, notas": `13:41151`; "não existe watchtracking": `13:43963`); a PoC implementa de ponta a ponta com testes e2e que fixam o comportamento (`tests/22`, `25`, `42`, `01`).
- **Opções:** (A) remover consumo; manter "Acompanhando" (binário); (B) manter como recurso privado e rever Figma/requisito; (C) híbrido: manter o estado sem contador/nota.
- **Recomendação (Proposta):** (A). Migração: converter cada `Anime` de um usuário em vínculo "acompanha" preservando `createdAt`; arquivar (não apagar) os campos de consumo por um período; revisar os testes citados.
- **Bloqueia:** Minha Lista; layout e remoção de acompanhamento; notificações.

### D-03 — Detalhe público de obra (P0) — Figma: **DF** (público) — **APROVADA em 2026-10-09**
- **Pergunta:** confirmar que Visitante e quem não acompanha a obra abrem a página dela (sinopse, próximo episódio, informações, discussões).
- **Figma:** `8:1953` ("Visitante pode ler. Entrar é necessário para publicar, responder, curtir, compartilhar, seguir ou denunciar"); `13:42397` integra Discussões.
- **Contexto:** hoje `/anime/[id]` é a linha por usuário; anônimo e não-dono recebem 404 (`anime/[id]/page.tsx:35,43`).
- **Opções:** (A) página pública sobre catálogo compartilhado; (B) manter per-user e ampliar o modal; (C) público de leitura limitada.
- **Recomendação (Proposta):** (A), por produção canônica (depende de D-18).

### D-04 — Alcance de "preservar destino" (P1) — Figma: **DF parcial**
- **Pergunta:** o retorno após login restaura a *página e a intenção* (volta ao anime com "+ Acompanhar" disponível) **sem** executar a ação (`8:5982`, `8:5876`), ou também executa a ação pendente? E deep links de notificação, rascunho e alvo de resposta (`13:43963`)?
- **Recomendação (Proposta):** seguir o Figma: retornar ao destino exato (caminho relativo validado: `startsWith("/") && !startsWith("//")`, sem open redirect), preservar rascunho e alvo, **não** criar vínculo/publicar sozinho.
- **Bloqueia:** TR-033, FL-09/10, FL-02/05/07.

### D-05 — Home e área "Comunidade" (P1) — Figma: **DF**
- **Figma:** nav com 4 destinos EXPLORAR · CALENDÁRIO · MINHA LISTA · COMUNIDADE (`13:41078`); **logo → Dashboard** (autenticado), sem item de menu "Dashboard" (`13:41124`, `8:5982`); visitante: Explorar. Comunidade traz feeds, busca, hashtag e discussão.
- **Pergunta:** adotar esse mapa (hoje o Feed é a home, `app/page.tsx:7-19`)?
- **Recomendação (Proposta):** sim — resolve o princípio 10 e a meta "o que sai hoje? ≤ 2 s".

### D-06 — Hierarquia de título e Kana (P1) — Figma: **DF**
- **Figma:** padrão "Japonês (kanji+kana+inglês)"; alternativa "Romaji (romaji+inglês), sem kana"; "Kana é a leitura em kana"; formato ≠ idioma da interface (`8:183`, `8:3333`).
- **Pergunta:** de onde vem o kana (AniList só dá `native` e romaji)? A preferência é por conta ou por dispositivo? O título em português manual da PoC continua?
- **Opções:** kana por leitura gerada (furigana já existe), via AniDB, ou campo próprio; preferência em coluna de `User` com fallback local.
- **Recomendação (Proposta):** seguir o Figma; preferência na conta; avaliar o português manual como override opcional (o Figma não o prevê).

### D-07 — Fuso horário (P1) — Figma: **DF**
- **Figma:** padrão `America/Sao_Paulo`, select em Configurações, subtítulo "Horários locais em America/Sao_Paulo"; UTC só em proveniência do Admin.
- **Recomendação (Proposta):** padrão America/Sao_Paulo, preferência por conta com opção "usar fuso do dispositivo", rótulo visível; o servidor recebe fuso IANA em vez de depender do `weekStart` do cliente.

### D-08 — Início da semana (P2) — Figma: **DF**
- Segunda→domingo (semana "05–11 out", `8:2106`). **Recomendação (Proposta):** segunda. Baixo custo.

### D-09 — Spoilers (P1) — Figma: **DF com lacunas**
- **Figma:** o *autor* marca "Contém spoilers" (desmarcado por padrão; "não depende de episódios assistidos": `13:41840`); aviso substitui o texto, sem trecho nem camada oculta; revelar é por item, com "Ocultar novamente"; notificações nunca trazem trecho; abre-por-notificação não revela (`13:41155`, `13:43079`, `13:43963`, fluxo F).
- **Lacunas do próprio Figma (FV-06):** a *prévia de resposta* no feed e as *hashtags* ficam fora do bloco; sem variante para busca, citação, bio.
- **Perguntas:** o leitor tem preferência "mostrar sempre"? A prévia de resposta com spoiler é ocultada? Sinopse de episódio entra no mesmo mecanismo?
- **Recomendação (Proposta):** campo do autor em publicação **e** resposta já na primeira migração; sinopse de episódio atrás de ação explícita; prévias de resposta respeitam a flag da resposta.

### D-10 — Bloqueio (P1) — Figma: **DF parcial**
- **Figma:** bloquear com confirmação ("Bloquear @rafamori?"); perfil bloqueado sem bio/posts/lista; desbloquear não faz seguir; mensagem neutra "Perfil indisponível"; "As interações deste perfil deixarão de aparecer para você" (`13:43571`). Não desenha: lista de bloqueados, efeito em feeds/notificações.
- **Recomendação (Proposta):** bloqueio com visibilidade e interação filtradas no servidor em todos os feeds/trending/notificações; remover follow mútuo ao bloquear; criar a lista de bloqueados.

### D-11 — Notificações sociais (P2) — Figma: **DF eventos / PF agregação**
- **Figma:** resposta à publicação, resposta ao comentário, novo seguidor; curtidas OFF por padrão; "Desativar todo o Social" não afeta Lançamentos; agregação "ainda validar" (`13:41172`).
- **Recomendação (Proposta):** eventos individuais; curtidas (quando ligadas) agregadas por publicação/hora; retenção de 30 dias; só sino na v1.

### D-12 — Feeds (P2) — Figma: **contrato DF / política PF**
- **Figma:** Para você = sugestões simples por obras e temas declarados (sem preferências conhecidas: discussões públicas explicitamente não personalizadas); Seguindo cronológico; Recentes públicas cronológicas; "Em alta" **apenas** na hashtag (critério e janela pendentes).
- **Pergunta:** o que é "declarar interesses" (onde se declara)? Qual a janela de "Em alta"?
- **Recomendação (Proposta):** "interesses" = obras acompanhadas + hashtags seguidas/usadas, sem expor a lista; "Em alta" = janela de 24–72 h por interações na hashtag.

### D-13 — Limites e semântica de hashtag (P2) — Figma: **semântica DF / limites PF**
- **Figma:** hashtag case-insensitive com ID canônico e sem duplicatas; tipos obra/temporada/gênero/tópico; **não cria associação de anime**; limites sem número.
- **Recomendação (Proposta):** manter 500/300 até decisão; hashtag livre e **separada** da obra (obra por seletor explícito); Unicode (letras/números/`_`), máximo 5 por publicação.

### D-14 — Rascunhos (P3) — Figma: **PF**
- O Figma exige rascunho preservado em erro, em login e em descarte, mas deixa a retenção pendente. **Recomendação (Proposta):** preservação em memória/sessão durante o fluxo; sem rascunho persistente entre sessões na v1.

### D-15 — Mídia, avatar, repost e citação (P2) — Figma: **DF (fora da V1)**
- **Opções:** (A) remover/ocultar upload de mídia, URL externa e **upload de avatar** (Epic 28, WT); (B) manter só upload próprio; (C) manter tudo.
- **Recomendação (Proposta):** (A), por coerência com `13:41151`/`13:42736`; se o produto quiser fotos de perfil, tratar como mudança de escopo no Figma antes do código. Repost/citação seguem em D-28.

### D-16 — Moderação (P1) — Figma: **DF**
- **Figma:** denunciar publicação, comentário e perfil; 4 motivos (Spam ou conteúdo repetitivo · Assédio ou discurso de ódio · Spoiler sem aviso · Outro); denúncia privada, sem selo público, sem dados pessoais, **não bloqueia automaticamente**; Admin existente recebe "revisão mínima"; tombstone neutro.
- **Pergunta restante:** suspensão/banimento, aviso ao autor, apelação (o Figma não define).
- **Recomendação (Proposta):** implementar os motivos e alvos do Figma; suspensão (não banimento) na v1; sem apelação formal.

### D-17 — Admin de dados (P1) — Figma: **DF**
- **Figma:** 9 seções (Dashboard · Catálogo · Importações · Matching · Scrapers · Jobs · Conflitos · Overrides · Logs); importação em 7 etapas com confirmação; overrides só de BroadcastDate/Time; auditoria. É um **produto Admin inteiro**, muito maior que o Admin da PoC (convites/usuários/denúncias).
- **Pergunta:** qual o recorte da v1 (o Figma não prioriza)? E a coexistência com o Admin atual?
- **Recomendação (Proposta):** fatiar: (1) `IngestionRun` + Logs + confirmação (staging); (2) Catálogo Franquia→Produção; (3) Matching e Conflitos; (4) Overrides globais; Scrapers só após **D-30**.

### D-18 — Modelo de domínio (P0) — Figma: **DF** — **APROVADA em 2026-10-09**
- **Figma:** `Franchise #101 → Production #501 (Season 1) e #502 (Season 2). O sufixo de temporada pertence à produção, não gera uma nova franquia.` (`8:3603`); TV/Movie/OVA/Special distintos; fontes AniDB e "Curadoria"; discussão e publicação associadas à **produção** (`13:41925`: "franquia não é uma produção selecionável"); relacionados por gênero/tema/produção.
- **Pergunta:** adotar esse modelo (entidades canônicas compartilhadas) e migrar o `Anime` por usuário para um vínculo? Como mapear AniList (entradas/relations) e AniDB para Production?
- **Contexto:** hoje a "franquia" é uma regex sobre o título, por usuário; comprovado que "Attack on Titan: The Final Season" e "Sword Art Online: Alicization" viram franquias novas.
- **Recomendação (Proposta):** entidades canônicas; "acompanhar" referencia a **produção**; discussão referencia a produção com agregação por franquia; migração para `UserTracking`.

### D-19 — Mobile (P2) — Figma: **DF (sem mobile)**
- O Figma não tem versões mobile e declara 1280 e 1920 "não validados" (`13:41166/69`). **Recomendação (Proposta):** manter responsividade como degradação aceitável, especificar 1280/1440/1920; incluir breakpoints no Figma se mobile for requisito.

### D-20 — Tokens e tipografia (P2) — Figma: **DF**
- **Figma:** 12 tokens (`#08080B`/`#FF164F`…), Inter + **Noto Sans JP**, raios 10/12/16, escala 8–80; "Magenta é a única cor de marca". O Figma **tem** fonte para japonês (a rev.1 estava errada).
- **Pergunta:** os tokens do Figma são fonte única? A paleta multicolor e o Anton da PoC saem?
- **Recomendação (Proposta):** sim; accent `#FF164F` para texto/realce e botão cheio com texto escuro `#08080B` (≈5,22:1) — branco sobre o accent dá 3,43:1 e falha AA (o Figma avisa em `8:147`).

### D-21 — Primeiro administrador (P1) — Figma: **NF**
- O Figma mostra um admin "AK" já existente e não descreve a criação. **Recomendação (Proposta):** criar o admin por CLI/variável de ambiente no deploy, desligar o signup sem convite e tornar a checagem atômica.

### D-22 — Anti-abuso e retenção (P1) — Figma: **PF**
- Rate limits "sem números definitivos" (`13:41172`). **Recomendação (Proposta):** rate limit em login/cadastro/rotas que chamam APIs externas; resposta neutra no cadastro; purga de sessões expiradas; retenção definida para uploads (se mantidos).

### D-23 — Discussões (P2) — Figma: **DF implícito**
- No Figma, uma "discussão" é uma publicação (original) + respostas, associada a uma produção. **Pergunta:** unificamos `Comment` (por obra) e `PostComment` (por publicação)? **Recomendação (Proposta):** sim; a página da obra lista as publicações da produção; migrar `Comment`.

### D-24 — Perfil e identidade (P3) — Figma: **PF**
- "Visibilidade das relações de seguidores ainda será validada" (`13:42598`); "Discussões iniciadas" não desenhada. **Recomendação (Proposta):** handle único (o Figma usa `@identificador`), edição de nome/identificador/bio; seguidores como contagem na v1.

### D-25 — Calendário: a confirmar, adiado, cancelado (P2) — Figma: **DF**
- **Figma:** "Horário não definido", "Data não definida", "Atrasado", "Adiado · nova data a confirmar", "Cancelado · não ativo"; "Nunca inventar posição na grade".
- **Recomendação (Proposta):** implementar os estados; reconciliar por janela a cada ingestão (marcar, não apagar); exibir a idade do dado quando o cache estiver velho.

### D-26 — Notificação de lançamento (P1) — Figma: **DF**
- **Figma:** "Novos episódios e datas alteradas — Somente dos animes que você acompanha" (`13:42966`); itens NOVO EPISÓDIO e DATA ALTERADA (com "Antes: …").
- **Pergunta restante:** aviso no horário, antecipado ou ambos? **Recomendação (Proposta):** toda obra acompanhada; "no ar" + lembrete opcional; preferências por conta; alinhar a doc do schema.

### D-27 — Publicar exige acompanhar? (P1) — Figma: **DF (não exige)**
- **Figma:** contexto de anime é *opcional* (`13:41840`); acompanhar e seguir "nunca publicam" nada (`13:41130`); publicar a partir do detalhe não cria acompanhamento (`13:42397`).
- **Recomendação (Proposta):** sim — permitir publicar/comentar sobre qualquer produção do catálogo e mostrar o CTA "Acompanhar".

### D-28 — ShareAction "Compartilhar internamente" (P2) — Figma: **NF** (novo)
- **Contexto:** o Figma mostra a ação em todo post e a evidencia como *referência ao original* ("Compartilhar cria uma referência ao original, não uma cópia": `13:42257`; exemplo com texto próprio + cartão: `13:41181`; "Publicação original indisponível": `13:43571`). **Não desenha o fluxo** (composer, destino, contagem). A PoC implementa repost puro (sem texto) **e** citação.
- **Pergunta:** o ShareAction é sempre "referência com texto próprio" (citação) ou também permite repost puro? Mostra contagem? O que acontece quando o original é apagado/bloqueado (tombstone)?
- **Recomendação (Proposta):** só referência com texto próprio na v1 (coerente com o Figma); remover o repost puro ou deixá-lo atrás de decisão explícita.

### D-29 — Extras do detalhe da PoC (P2) — Figma: **NF** (novo)
- **Contexto:** a PoC tem "Onde assistir" (links de plataforma digitados pelo usuário), elenco, trailer, lista de episódios com sinopse e marca de "assistido" e recomendações da AniList; o Figma prevê só **Site oficial** como destino externo ("sem player") e "Histórias relacionadas" editoriais.
- **Pergunta:** mantemos esses blocos? "Onde assistir" ainda é aceitável sem player (é só link)?
- **Recomendação (Proposta):** manter elenco/trailer/recomendações como enriquecimento opcional (sem conflito de princípio); remover marca de "assistido" (D-02); decidir "Onde assistir" explicitamente; lista de episódios só atrás do mecanismo de spoiler (D-09).

### D-30 — Política de scraping (P1) — Figma: **Conflito** (novo)
- **Contexto:** o Figma especifica **Scrapers** (AniDB e "Site oficial/programação"), parsers versionados (`1.4.2`, `official-1.0`), jobs "Scrape", HTTP 500 na obtenção do HTML, e ao mesmo tempo uma importação por **HTML colado manualmente** (`8:3894`). Não há linguagem sobre robots.txt, termos de uso, licença, rate limit ou cache. A regra histórica do projeto é "só APIs legítimas, sem scraping" e a PoC cumpre (nenhum scraping). *(Conhecimento externo, não verificado nesta auditoria: AniDB restringe acesso automatizado por termos de uso — checar antes de decidir.)*
- **Opções:** (A) adotar apenas **colagem manual de HTML** (humano no ciclo; sem robô); (B) APIs/dumps oficiais para as mesmas fontes; (C) scrapers automatizados com guardas legais (robots, rate limit, UA identificado, cache); (D) adiar Scrapers e especificar só Importação/Matching/Conflitos.
- **Recomendação (Proposta):** (D) agora, com (A) ou (B) quando a importação for construída; (C) só após parecer sobre termos de uso e identificação da "segunda fonte" (FV-09).
- **Bloqueia:** TR-110/116, FL-13/14.

### D-31 — Contas: cadastro, convite, recuperação de senha, identidade (P2) — Figma: **NF** (novo)
- **Contexto:** o Figma desenha só o login (`8:2371`, "Autenticação mínima por email e senha"); não há cadastro, convite, "esqueci a senha", nem tratamento do primeiro admin. A PoC tem cadastro por convite.
- **Recomendação (Proposta):** manter o cadastro por convite como está e desenhar as telas faltantes no Figma antes de mexer; tratar recuperação de senha como decisão separada.

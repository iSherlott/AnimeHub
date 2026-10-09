# FIGMA_INVENTORY — Inventário real do arquivo Figma (revisão 2)

> Auditoria de 2026-10-08, **revisão 2**. Fonte A. Tudo abaixo vem de leitura real do arquivo
> `fileKey vg9LobYvRnXk2iUmDd7uXa` pelo conector do Figma (`get_metadata`, `get_variable_defs`, `get_libraries`,
> `get_screenshot`) usando os links com `node-id` fornecidos pelo responsável pelo produto. Cada frame foi
> transcrito a partir do screenshot em resolução nativa (1440 px). Nenhum nó foi inferido do relatório de entrega.
>
> **Esta revisão substitui a primeira versão deste arquivo.** A revisão 1 concluiu que o arquivo tinha "uma
> página, um frame e zero componentes". Isso estava **errado**: o conector só *lista* a primeira página
> (`get_metadata` sem `nodeId` devolve apenas `0:1 — 01 Design Foundations`), mas as demais 16 páginas existem e
> abrem normalmente por `node-id`. Detalhes em §1.

## 0. Resultado em uma frase

O arquivo tem **17 páginas, 61 frames de topo, 55 definições de componente (33 nativos + 22 sociais) e 8 fluxos
sociais documentados (A–H) mais 6 fluxos de protótipo**, cobrindo Fundamentos, UX pública, UX autenticada, Admin,
Estados, Protótipos e a expansão social (páginas 13–17). **Todo o conteúdo é especificação estática: todo frame
declara "Nenhuma interação de protótipo conectada".**

## 1. Correção do acesso (o que mudou da revisão 1 para a 2)

| Fato | Evidência |
| --- | --- |
| O conector lista só a página `0:1` | `get_metadata` sem `nodeId` → "Top-level pages: 0:1: 01 — Design Foundations" (idêntico em 2026-10-08, antes e depois de receber os links) |
| As outras páginas existem e abrem por `node-id` | `8:78`, `10:36…10:45`, `13:44907…13:44911` retornam `<canvas>` com frames reais |
| O rodapé do frame `8:3` já dizia a verdade | "Expansão social nas páginas 13–17" |
| Na revisão 1 contei **0 componentes**; o correto é **55** | Nós `symbol` em `10:2…10:34` (33) e na seção `13:45200` + `13:45674` (22) |
| O link `node-id=0-1` da revisão 1 só mostrava a primeira página | Limitação do conector, não do arquivo |

**Consequência:** todas as conclusões da revisão 1 sobre "Figma sem telas/componentes" foram **retiradas**; as
linhas da matriz antes marcadas como "descritas, não inspecionáveis" agora têm fonte *inspecionada* (`FIGMA_POC_TRACEABILITY.md`).
Ressalva de método: o conector tem limite de chamadas; algumas leituras foram refeitas em sequência e três
sub-frames da página 06 foram lidos por recorte ampliado do screenshot (legíveis). Nenhum texto ficou ilegível.

## 2. Confirmação do relatório de entrega

Legenda: **Confirmado** / **Parcialmente confirmado** / **Não confirmado** / **Não verificável**.

| # | Item relatado | Veredito | Evidência |
| --- | --- | --- | --- |
| 1 | Fundamentos da versão inicial | **Confirmado** | Páginas 01–07: cores, tipografia, espaçamento, ícones, componentes, padrões (`8:3`, `8:78`, `8:183`, `8:269`, `8:528`, `8:691`, `8:1222`) |
| 2 | Componentes da versão inicial | **Confirmado** | 33 componentes nativos (`10:2…10:34`); rodapé: "33 componentes nativos e tokens… implantados" |
| 3 | Telas de exploração, calendário, lista pessoal, detalhes | **Confirmado** | `8:1361` Explorar, `8:1606` Busca, `8:1733` Temporada, `8:2106` Calendário, `8:2608` Minha Lista, `8:1953` Detalhe, `8:2442` Dashboard |
| 4 | Nova área de comunidade | **Confirmado** | Páginas 13–17 (`13:41067`, `13:41181`…) |
| 5 | Feeds Para você, Seguindo, Recentes | **Confirmado** | `13:41181`, `13:41417`, `13:41628` |
| 6 | Descoberta por hashtags e área Em alta | **Parcialmente confirmado** | Página de hashtag desenhada (`13:42068`); a aba **Em alta** só tem texto de definição, **não está desenhada** |
| 7 | Publicações, discussões e respostas | **Confirmado** | `13:41840`, `13:41925`, `13:42257`, `13:42397`, `13:43375` |
| 8 | Perfis sociais | **Confirmado** | `13:42598` (outra pessoa), `13:42736` (próprio); a aba "Discussões iniciadas" não está desenhada |
| 9 | Notificações de lançamentos e sociais | **Confirmado** | `8:3123`, `13:42872`, `13:42966`, `13:43963` |
| 10 | Denúncia, bloqueio e exclusão | **Confirmado** | `13:43571` (menus, motivos, confirmações, bloqueio, tombstone) |
| 11 | Estados vazios, carregamento, erro e conteúdo removido | **Confirmado** | Página 11 (`8:5235`…`8:5802`) e páginas 16 (`13:43375`, `13:43571`, `13:43738`, `13:43963`) |
| 12 | Estados de spoiler | **Confirmado** | `SpoilerNotice`/`SpoilerReveal` (`13:45399`, `13:45400`), `13:43963`, fluxo F |
| 13 | Componentes e variantes reutilizados | **Confirmado** | 33 nativos + 22 sociais, com instâncias nas telas (ex.: `Header / Expansão social`, `SocialPost / Compacta`) |
| 14 | Oito fluxos documentados, sem protótipos navegáveis completos | **Confirmado** | Fluxos A–H em `13:44169` e `13:44298`; footers: "Nenhuma interação de protótipo conectada" |

Contagem: **13 confirmados, 1 parcialmente confirmado, 0 não confirmados, 0 não verificáveis** (denominador = 14 afirmações).

## 3. Estrutura real do arquivo (17 páginas, 61 frames)

| Pág. | Nome | Frames de topo (id) |
| --- | --- | --- |
| 01 | Design Foundations (`0:1`) | `8:3` |
| 02 | Colors | `8:78` |
| 03 | Typography (`10:36`) | `8:183` |
| 04 | Spacing (`10:37`) | `8:269` |
| 05 | Icons (`10:38`) | `8:528` |
| 06 | Components (`10:39`) | `8:691` (33 symbols `10:2…10:34`) |
| 07 | Patterns (`10:40`) | `8:1222` |
| 08 | Public UX (`10:41`) — 6 telas | `8:1361` Explorar · `8:1606` Busca · `8:1733` Temporada Autumn2026 · `8:1953` Detalhe Anime (com Discussões `13:44778`) · `8:2106` Calendário · `8:2371` Login |
| 09 | Authenticated UX (`10:42`) — 4 telas | `8:2442` Dashboard · `8:2608` Minha Lista · `8:3123` Notificações · `8:3333` Configurações |
| 10 | Admin UX (`10:43`) — 11 telas | `8:3436` Dashboard · `8:3603` Catálogo · `8:3894` Importação · `8:4020` Resultado Importação · `8:4179` Matching · `8:4327` Conflitos · `8:4471` Overrides · `8:4597` Scrapers · `8:4740` Jobs · `8:4919` Job Detail · `8:5077` Logs |
| 11 | States (`10:44`) — 6 pranchas | `8:5235` Empty · `8:5323` Loading · `8:5448` Error · `8:5542` Success · `8:5720` Modal · `8:5802` Confirmation |
| 12 | Prototypes (`10:45`) — 6 fluxos | `8:5876` 01 Visitante descobre · `8:5982` 02 Visitante acompanha · `8:6088` 03 Voltar no novo episódio · `8:6189` 04 Agenda pessoal · `8:6295` 05 Importar com revisão · `8:6421` 06 Resolver divergência |
| 13 | Social Architecture (`13:44907`) | `13:41067` |
| 14 | Community UX (`13:44908`) — 12 telas | `13:41181` Para você · `13:41417` Seguindo · `13:41628` Recentes · `13:41840` Criar publicação · `13:41925` Criar via anime · `13:42068` Hashtag/AnimeFall2026 · `13:42257` Discussão dedicada · `13:42397` Anime/Integração de discussões · `13:42598` Perfil/Outra pessoa · `13:42736` Perfil/Próprio · `13:42872` Sino/canais · `13:42966` Configurações/Preferências sociais |
| 15 | Social Components (`13:44909`) | `13:43079` Leitura · `13:43227` Ações · seção `13:45200` (definições locais) · symbol `13:45674` DiscussionThread |
| 16 | Social States (`13:44910`) | `13:43375` Publicação · `13:43571` Segurança · `13:43738` Descoberta · `13:43963` Resiliência |
| 17 | Social Flows (`13:44911`) — 8 fluxos | `13:44169` A–D · `13:44298` E–H |

Totais apurados por contagem direta do XML: **17 páginas · 61 frames de topo** (páginas 01–07: 1 frame cada = 7; pág. 08: 6; 09: 4; 10: 11; 11: 6; 12: 6; 13: 1; 14: 12; 15: 2; 16: 4; 17: 2 → 61).
Links diretos: `https://www.figma.com/design/vg9LobYvRnXk2iUmDd7uXa/?node-id=<id com hífen>` (ex.: `8-2442`).

## 4. Tokens e estilos (páginas 02–05 e `get_variable_defs`)

**Cores (12):** Background `#08080B` · Surface `#101116` · Elevated `#171820` · Border `#272832` ("divisões discretas; não neon") ·
Primary `#F2F2F5` · Secondary `#92939D` · **Accent `#FF164F`** (CTA, ativo, novo episódio) · Success `#22C55E` · Warning `#F59E0B` ·
Error `#EF4444` · Complementary `#8B5CF6` e `#3B82F6` (alternativas documentadas, nunca simultâneas).
Regra (`8:159`): "Magenta é a única cor de marca ativa nas telas." Glow só na ação principal, estado ativo, novo episódio ou pequeno hero.

**Tipografia (páginas 03 e 06):** **Inter** para UI, horário (24 h) e conteúdo em português; **Noto Sans JP** para identidade e leitura japonesa.
- Formato **Japonês (kanji + kana + inglês)**: kanji 40/60 bold (card 20/30), kana 18/27 (card 12/18), inglês 20/30 (card 13/19,5).
- Formato **Romaji (romaji + inglês)**: romaji lidera, inglês apoia, **sem kana**.
- "Kana é leitura fonética em kana. Nunca chamar esse formato de idioma." "'Formato dos títulos' não altera o idioma da interface."
- Papéis: Display 56/67, Heading 40/48, Section 24/36, Japanese title 20/30 ou 40/60, Time 26/39, Body 16/24, Metadata 14/21 e 12/18, Badge 11/16,5.

**Espaçamento e grid (página 04):** escala 8·16·24·32·40·48·64·80 (exportados: 8, 10, 12, 16, 24, 32, 40, 64); raios **10 / 12 / 16**; 1440 px = 12 colunas, margens 64, gutter 24, área 1312; 1280 = 1184, margens 48, gutter 16; 1920 = máx. 1536 centralizado, margens 192; header 88 px; sidebar admin 224 px. **"Sem versões mobile."**

**Ícones (página 05):** Lucide outline 18–24 px, traço 1,7–2; botões ≥ 44 px; `aria-label` em sino/configurações/perfil.
**Interação (páginas 05, 07, 11):** hover 150–200 ms (180 recomendado); modal 200–250 ms (220 recomendado); foco = borda clara 2 px + offset 2 px; focus trap e `Esc` nos diálogos.

**Contraste calculado (WCAG 2.x) com os tokens reais do Figma:** Primary/Background 17,90 · Secondary/Surface 6,18 · Accent/Background 5,22 (passa como texto) ·
texto escuro `#08080B` sobre Accent 5,22 (por isso o botão "+ Acompanhar" usa texto escuro) · branco sobre Accent 3,43 (**falha** — o próprio Figma avisa em `8:147`) ·
Border/Background 1,37 (decorativo). O Figma declara "primary/background ≈ 17,7:1" (diferença de arredondamento).

## 5. Componentes (55 definições `symbol`)

**33 nativos (página 06, `10:2…10:34`):** Header/Visitante, Header/Autenticado, Navegação/Admin, Anime Card/Normal, Anime Card/Novo episódio, Títulos/Japonês, Títulos/Romaji,
Agenda/Novo episódio, Agenda/Acompanhando, Follow/Default · Acompanhando · Foco · Indisponível, Campo/Busca · Gênero · Temporada · Timezone, Filtro/Minha Lista e Todos,
Badges (Data e hora, Sem horário, Sem data, Atrasado, Adiado, Em exibição, Finalizado, Cancelado, Novo episódio), Feedback/Success, Feedback/Info, Skeleton/Imagem, Tabela/Admin,
Dialog/Revisar importação, Dialog/Remover acompanhamento.

**22 sociais (página 15):** PostComposer, AnimeContextBadge, HashtagChip, HashtagSuggestions, ReplyAction, ShareAction, UserIdentity, ReplyComposer, ReportMenu, OwnPostMenu, EmptySocialState (11 avulsos);
SocialPost (Compacta, Expandida), ReactionAction (Curtir, Curtido), Spoiler (Hidden, Revealed), ProfileFollow (Seguir, Seguindo), SocialNotificationItem (NãoLida, Lida) (10 variantes em 5 conjuntos); DiscussionThread (1).
O Figma resume como "17 famílias locais, 22 mains sociais e 5 conjuntos nativos de variantes" (`13:41164`) — **confere** com a contagem acima.

## 6. Interações de protótipo

**Nenhuma conectada.** Rodapé de todos os frames das páginas 02–12: "Nenhuma interação de protótipo conectada"; frames de protótipo: "Especificação de fluxo — interações a conectar… Não existem links de protótipo, navegação real, handlers ou animações nesta entrega";
páginas 13–17: "interações não conectadas". O conector não expõe fios de protótipo; a afirmação vem do texto dos frames.

## 7. Auditoria visual e inconsistências do próprio Figma

| ID | Achado | Gravidade | Evidência |
| --- | --- | --- | --- |
| FV-01 | A tabela de papéis tipográficos fala em pesos **750/650** e Display **56** que não existem como estilos nomeados (reais: 400/700/800; Inter 64 Auto, Inter 40 Bold) | P3 | `8:183` × `get_variable_defs` |
| FV-02 | "+ Acompanhar" aparece em estilo **accent** (Follow/Default, Explorar) e em estilo **neutro** (Anime Card/Normal) | P2 | `8:691` × `8:1361` |
| FV-03 | Dashboard: "Depois de hoje" mostra `02:00 · EP05` junto do chip "sem horário definido" para o mesmo item | P2 | `8:2442` |
| FV-04 | Detalhe autenticado exibe "Entre para criar sua agenda pessoal" ao lado de "+ Acompanhar" com header já logado (AK) | P2 | `13:42397` |
| FV-05 | Formatos de tempo inconsistentes entre telas sociais (relativo "há 18 min", absoluto "12:42", "Ontem · 18:12") | P3 | `13:41181`, `13:41417`, `13:42598` |
| FV-06 | **Spoiler:** a prévia de resposta no feed ("Bia: …") e as hashtags ficam **fora** do bloco oculto; sem variante de spoiler para busca, citação e bio | P1 | `13:41181`, `13:41155` |
| FV-07 | "Em alta" (hashtag) e "Discussões iniciadas" (perfil) são citados mas **não desenhados**; sem tela de **resultados** da busca social, sem frame de "Saiba como", sem lista de bloqueados, sem tombstone de comentário | P2 | `13:42068`, `13:42598` |
| FV-08 | Filtro "Status" de Minha Lista sem opções desenhadas (risco de reintroduzir status de consumo) | P2 | `8:2608` |
| FV-09 | Fonte "Site oficial" do Admin sem identificação (qual site/emissora?) | P2 | `8:4597`, `8:4327` |
| FV-10 | Header de **visitante** mostra sino e ajustes (sem função definida para visitante) | P3 | `8:1361` |
| FV-11 | O swatch "Surface" é praticamente invisível sobre o painel (mesma cor) | P3 | `8:78` |
| FV-12 | Adaptação a **1280 e 1920** declarada "não validada" pelo próprio Figma | P2 | `13:41166`, `13:41169` |
| FV-13 | Botão branco sobre accent falha AA (3,43:1); o Figma reconhece e orienta texto escuro/CTA grande | P2 | `8:147` |
| FV-14 | Rótulo "Campo em foco" no lugar de "Fuso horário" no componente Campo/Timezone (rótulo de documentação do estado) | P3 | `10:18` |
| FV-15 | Copy de busca "kanji, kana, romaji ou inglês" menciona romaji enquanto o formato padrão é Japonês (P-4) — apenas texto de busca | P3 | `8:1606`, `8:5235` |
| FV-16 | Fluxo 03 omite o caminho do sino na cadeia, embora a tabela o descreva; fluxo 05 lista 6 destinos e 7 passos | P3 | `8:6088`, `8:6295` |

Pontos fortes do Figma (positivos): grid e margens consistentes (64 px; 1312 px); estados sempre com ícone **e** texto (regra explícita); vocabulário de estado de data completo; contraste do texto principal e secundário muito acima de AA; regras de acessibilidade (foco 2 px, ≥ 44 px, `aria-*`, trap de foco) escritas em cada tela de estado.

## 8. O que o Figma fixa como contrato (consolidado; detalhes por tela nos demais documentos)

1. **Produto:** agenda pessoal de lançamentos; "registra interesse, não consumo"; sem player/streaming; **Acompanhar** é um vínculo único por usuário/produção; "✓ Acompanhando" nunca significa assistido.
2. **Papéis:** Visitante explora, pesquisa, **abre detalhe**, vê calendário "Todos" e **lê** comunidade; Acompanhar/Minha Lista/publicar/curtir/responder/seguir exigem login **com retorno ao destino e intenção** (o vínculo só é criado ao confirmar "+ Acompanhar"; o rascunho é preservado). Admin: área separada.
3. **Navegação:** EXPLORAR · CALENDÁRIO · MINHA LISTA · COMUNIDADE; logo → Dashboard (autenticado), sem item de menu "Dashboard"; perfil/conta/configurações secundários.
4. **Tempo:** semana **segunda→domingo**; fuso padrão America/Sao_Paulo, configurável; horário antes de "EP"; "Horário não definido", "Data não definida", "Atrasado", "Adiado · nova data a confirmar", "Cancelado · não ativo"; nunca inventar horário ou posição na grade; UTC só em proveniência (Admin).
5. **Títulos:** Japonês → Kana → Inglês (padrão) ou Romaji → Inglês; kana = leitura; não altera o idioma da interface.
6. **Modelo de catálogo:** Franquia → Produção (o sufixo de temporada pertence à produção); TV/Movie/OVA/Special distintos; fontes AniDB e "Curadoria".
7. **Social V1:** só texto; contexto de anime **opcional e explícito** (produção, não franquia); hashtags com ID canônico (obra/temporada/gênero/tópico); curtir, responder (um nível visual), "Compartilhar internamente" (referência), seguir perfil, denunciar (post/comentário/perfil; motivos fixos; privada), bloquear (com confirmação), excluir o próprio; **sem** mídia, edição, salvos, DM, grupos, progresso, reputação.
8. **Feeds:** Para você (sugestões simples por obras/temas declarados; não cronológico; sem ML; sem preferências → discussões públicas não personalizadas), Seguindo (cronológico), Recentes (público, cronológico); "Em alta" só na hashtag.
9. **Spoilers:** marcação pelo autor (desmarcada por padrão, independente de episódios assistidos); aviso substitui o texto, sem trecho; revelar exige ação explícita, por item; notificações nunca trazem trecho.
10. **Notificações:** um sino, dois canais (Lançamentos × Social); social = resposta à publicação, resposta ao comentário, novo seguidor (curtidas desativadas por padrão); desligar Social não afeta Lançamentos.
11. **Admin:** importação por HTML colado → Parse → Normalize → Matching → Prévia → Confirmação → Commit; **nada é salvo sem confirmação**; matching ponderado; conflitos A×B; overrides só de BroadcastDate/BroadcastTime com proveniência; **Scrapers** (AniDB, Site oficial) com execução explícita; Jobs/Logs com trilha de auditoria.
12. **Pendências declaradas pelo próprio Figma (`13:41172`):** limites de caracteres, hashtags e rate limits; normalização; agregação de notificações; recomendação e "Em alta"; visibilidade de seguidores; retenção de rascunhos; edição futura; nível de resposta (provisório).
13. **Dados ilustrativos:** "hoje" fixo em sábado 10/10/2026; programação e atividade fictícias.

# AUDIT_SUMMARY — Auditoria técnica e funcional Figma × PoC (ANIME HUB) — rev.2

> Data: 2026-10-08 (rev.2 concluída em 2026-10-09) · Etapa: **auditoria apenas** — nenhum código de aplicação, configuração, banco ou Figma foi alterado ·
> Estado do repositório: `HEAD e86c04d` + working tree não commitado (Epics 28/29 e `InlineEditField`) — ver `POC_INVENTORY.md` §13.
> **Esta auditoria aguarda revisão e aprovação explícita do responsável pelo produto. Nenhuma implementação deve começar antes disso.**

## 0. Histórico rev.1 → rev.2 (leia primeiro)

A **rev.1** concluiu que o Figma informado tinha "uma página, um frame, zero componentes" e que as telas eram inacessíveis. **Essa conclusão estava errada.** O conector do Figma, sem `node-id`, lista apenas a primeira página; as demais só abrem quando se passa o `node-id`. O responsável pelo produto enviou os links de todas as páginas e a **rev.2 inspecionou o arquivo inteiro**: **17 páginas, 61 frames, 55 componentes (33 do produto + 22 sociais), 8 fluxos sociais + 6 protótipos** — todos *estáticos* ("interações não conectadas").

Consequências, todas já refletidas nos 10 documentos:

| Item | Rev.1 (errado) | Rev.2 (inspecionado) |
| --- | --- | --- |
| Páginas / frames / componentes do Figma | 1 / 1 / 0 | **17 / 61 / 55** |
| Afirmações do relatório de entrega confirmadas | 1 em parte, 1 parcial, 2 não confirmadas, 10 não verificáveis | **13 confirmadas, 1 parcial** ("Em alta" não desenhada), 0 não confirmadas |
| Linhas da matriz com origem "descrita †" | 46 de 94 | **0** (103 inspecionadas + 5 sem elemento no Figma, de 108) |
| Fluxos | 10 "proxies" + 6 essenciais, todos "não verificáveis" no Figma | **14 fluxos reais do Figma** + 4 da PoC = 18 |
| Decisão D-01 (links do Figma) | P0 aberta | **Resolvida** |
| Estilo tipográfico para japonês | "não existe" (GAP-V-03) | **Existe** (Noto Sans JP; kanji 40/60, kana 18/27) |
| Componentes/variantes | "não existem" (GAP-V-02) | **Existem** (55) |
| Admin | "importar, matching, conflitos, auditar" (texto) | **9 telas** (Catálogo, Importações, Matching, Scrapers, Jobs, Conflitos, Overrides, Logs…) |

O que **não** mudou: o estado da PoC (código lido e dois fatos verificados ao vivo) e as divergências de fundo — a rev.2 as **confirmou e aprofundou** com nós reais.

## 1. Resumo executivo

1. **O Figma é um contrato rico, mas estático.** Define: agenda pessoal de lançamentos ("registra interesse, não consumo"); Visitante que **lê** tudo (detalhe, comunidade) e só autentica para agir, com **retorno ao destino e intenção**; navegação Explorar · Calendário · Minha Lista · Comunidade com **logo → Dashboard**; semana **segunda→domingo** em America/Sao_Paulo; títulos Japonês → Kana → Inglês; modelo **Franquia → Produção**; social V1 só texto (sem mídia, edição, salvos, DM); spoilers, bloqueio, denúncia, tombstone; um sino com canais Lançamentos × Social; Admin de ingestão com confirmação antes do commit. As **pendências são declaradas pelo próprio Figma** (`13:41172`): limites, rate limits, janela de "Em alta", agregação de notificações, retenção de rascunhos.
2. **A PoC diverge do Figma nos pilares:** é um **tracker de consumo completo** (o Figma o proíbe em 6 telas), é **responsiva/mobile** (Figma: sem mobile), semana **domingo→sábado**, padrão **inglês** sem kana, sem fuso padrão, **sem Dashboard**, **não preserva o destino** após o login, **detalhe da obra é 404 para visitante**, e **implementa mídia e upload de avatar** (fora da V1).
3. **Uma falha real em runtime, verificada ao vivo:** o **calendário da semana atual está vazio** — `GET /api/calendar?weekOffset=0` devolve `{"results":[]}`; a tabela de agenda tem 346 linhas com `max(airingAt)=2026-09-09` (hoje é 2026-10-08). O loader pagina em ordem crescente desde 8 semanas atrás com teto silencioso de 10 páginas e nunca chega ao presente, enquanto o container segue "healthy" (health estático).
4. **A raiz de vários problemas é de modelo:** não existe entidade Franquia/Produção; `Anime` é uma linha **por usuário** misturando catálogo, overrides e estado pessoal. Por isso o detalhe é privado, a franquia é uma regex sobre o título (comprovado: "Attack on Titan: The Final Season" vira franquia nova) e `Post`/`Comment`/`AiringAlert` usam `anilistId` solto. O Figma já desenha a solução (`8:3603`).
5. **Camada social:** funciona o essencial (publicar, curtir, seguir, responder, repostar, denunciar, fila de moderação), mas **faltam spoiler, bloqueio, "Recentes", busca e página de hashtag, notificações sociais, tombstone, @identificador, estados do compositor e erro distinto de vazio**; a PoC **contradiz** "mídia fora da V1" e exige acompanhar a obra para publicar (o Figma não).
6. **Dois conflitos de política novos que só o Figma completo revelou:** (a) o Figma especifica **Scrapers** de HTML (AniDB, "Site oficial") — a regra histórica do projeto é *sem scraping* (**D-30**); (b) o Admin do Figma é um **produto inteiro** (9 seções), muito maior que o Admin da PoC.
7. **Boas bases a preservar:** autorização por handler com 404 uniforme (IDOR não explorável), convite de uso único atômico, scrypt com dummy hash, upload com reencode WebP, soft delete, fallback em cache quando a AniList cai, 168 testes unitários e `tsc` limpos.
8. **O próprio Figma tem lacunas** (FV-06…FV-12): prévia de resposta e hashtags fora do bloco de spoiler; frames ausentes (menu "···", visitante social, aba "Em alta", resultados da busca social, lista de bloqueados, tombstone de comentário); filtro "Status" de Minha Lista sem opções; 1280/1920 "não validados"; sem telas de cadastro/recuperação de senha. Devem ser fechadas antes das fatias correspondentes.

## 2. Escopo e fontes

| Fonte | O que foi inspecionado | Situação |
| --- | --- | --- |
| **A — Figma** | `fileKey vg9LobYvRnXk2iUmDd7uXa`, 17 páginas via conector (`get_metadata`, `get_screenshot`, `get_variable_defs`, `get_design_context`) a partir dos links com `node-id` | **Inspecionado integralmente**; frames estáticos (`FIGMA_INVENTORY.md`) |
| **B — PoC** | Repositório `D:\My_Code\Challenge\Crunchyroll` (Next 16.3.5, React 19, MUI 9, Prisma 6, Postgres 16, 4 microsserviços) | Inventariado com evidências `arquivo:linha` (`POC_INVENTORY.md`) |
| **C — Requisitos** | Os 15 princípios do roteiro + regras textuais do Figma | Usados como critério; conflitos registrados (`OPEN_DECISIONS.md` §3) |

## 3. Método

- **Quatro investigações read-only da PoC** (frontend/UX/tokens; backend/dados/ingestão; social/moderação; autenticação/segurança/testes) e **seis investigações read-only do Figma** (fundações; telas públicas e autenticadas; Admin; estados e protótipos; arquitetura social e Comunidade; componentes, estados e fluxos sociais), cada uma com regras explícitas: não editar, não migrar, não executar a suíte Playwright, evidência obrigatória, "Não verificado" quando sem prova.
- **Conferência por amostragem:** repeti o `SELECT` da agenda e o `GET /api/calendar`; reconferi `author.completed` em `comments/route.ts:77,89,157`; refiz contagens estruturais; calculei contrastes WCAG com os tokens reais do Figma; confirmei por calendário que a semana "05–11 out/2026" é segunda→domingo; conferi as contagens de páginas/frames do Figma por contagem direta do XML.
- **Consolidação em dados únicos:** a matriz é gerada de um arquivo de dados (108 linhas, validado: IDs únicos, referências cruzadas existentes); as contagens do §7 saem desse dado.
- **Classificação:** vocabulário do roteiro (Implementado e funcional / parcialmente / Visual apenas / de outra forma / Ausente / Não verificável / Obsoleto ou conflitante) e níveis de bind. Prioridades: P0 bloqueador, P1 alta, P2 média, P3 baixa — **P0** reservado ao que impede validar a especificação ou quebra fluxo/dado/segurança essencial; P1 ao núcleo agenda/lista e aos *gates* de release social.

## 4. Limitações (leia antes de confiar em qualquer número)

1. **O Figma é estático.** Nenhuma interação está conectada; os "fluxos" são cadeias descritas. A comparação com a PoC é **funcional e estrutural** (telas, regras, estados, tokens), **não** uma comparação visual pixel a pixel.
2. **Nenhum fluxo foi executado em navegador.** Banco dev sem usuários (`User=0`, `Anime=0`); criar contas/sessões seria escrita.
3. **A suíte Playwright (45 specs, ≈214 testes) não foi executada:** o `global-setup` faz `DROP SCHEMA public CASCADE` no banco `animehub_test`, roda `prisma migrate deploy`, `next build` e `next start` — mutante para uma etapa que proíbe alterar dados/serviços. Rodaram `test:unit` (168 ✔), `tsc` (0 erros) e `lint` (6 erros + 1 aviso preexistentes).
4. **Working tree não commitado:** Epics 28/29 e `InlineEditField` estão no disco e **sem testes**; o banco dev já tem as colunas novas. Itens que dependem deles estão marcados **(WT)**.
5. **Não verificado:** dependências circulares; efeito de `next:{revalidate}` fora do Next; origem de erros "Server Reference ID" nos logs; usuário root em todos os serviços; corrida de `upsert` sob concorrência real; proxy/`request.url.origin` em produção; **restrições legais/termos de uso das fontes AniDB e "Site oficial"** (D-30 — dado externo não verificado).
6. **Dados do Figma são ilustrativos** (sábado 10/10/2026; contagens e atividade fictícias); a data real do sistema é 2026-10-08.
7. **Percentuais** usam como denominador o número de linhas da matriz (108), **não** telas nem requisitos; uma tela pode gerar várias linhas.

## 5. Riscos principais

| # | Risco | Prio | Evidência |
| --- | --- | --- | --- |
| 1 | Calendário atual vazio e invisível (loader não alcança o presente; health estático; E2E semeia dados) | **P0** | TR-011; `anilist.ts:373`; verificação ao vivo |
| 2 | Modelo de consumo contradiz o produto e sustenta UI, API e testes | **P0** | TR-034; `WatchProgress`; D-02 |
| 3 | Sem entidade canônica de obra: detalhe público impossível, franquia por regex, dados duplicados por usuário | **P0** | TR-003, TR-140; D-03/D-18 |
| 4 | Vazamento de dado da lista pessoal (`author.completed`) | P1 | TR-036; GAP-S-04 |
| 5 | Camada social sem spoiler (autor + superfícies), bloqueio e moderação completa — não pode ir a público; o próprio Figma deixa a prévia de resposta fora do bloco | P1 | TR-083, TR-090, TR-092, TR-095; GAP-V-01 |
| 6 | Destino e intenção não preservados; sem UI para deixar de acompanhar; sem Dashboard | P1 | TR-033, TR-031, TR-020 |
| 7 | Cadastro: 1ª conta sem convite vira ADMIN (não atômico); sem rate limit; enumeração de e-mails | P1 | TR-132/133/134 |
| 8 | **Política de scraping** em conflito (Figma × regra do projeto) antes de especificar a ingestão | P1 | TR-116; D-30; GAP-S-15 |
| 9 | Admin do Figma (9 seções) inexistente; ingestão grava direto nas tabelas finais | P1/P2 | TR-110…TR-119 |
| 10 | Escopo: mídia e upload de avatar (PoC) fora da V1 do Figma; extras de detalhe sem previsão | P2 | TR-067, TR-136; D-15/D-29 |
| 11 | HTML de terceiros sem sanitizar em páginas públicas e sem CSP | P2 | TR-135; GAP-S-05 |

## 6. Conclusão executiva (roteiro §16)

### A. O que está alinhado (correspondência completa — 9 linhas)
Calendário "Todos" para visitante e alternância Minha lista/Todos (TR-016/017), gate de Minha Lista (TR-032), lista ≠ relações sociais (TR-035), sinopse da obra (TR-043; sem sanitização), **ausência de edição de posts — consistente com a V1** (TR-064), seguir/deixar de seguir (TR-082), diálogos/menus com escape e retorno (TR-125), autenticação por convite e sessão (TR-130).

### B. O que deu bind (reaproveitável como está)
Padrão `requireUser/requireAdmin` + ownership 404; `processImageUpload`/`uploadValidation`; modelos com unicidade (`PostLike`, `Follow`, `PostReport`, `CommentReport`, `AiringAlert`); soft delete; `genreTaxonomy`; `AnimeTitle` com furigana e Noto Sans JP; `airingWindow`; `InlineEditField`/`UserAvatar` **(WT)**; hero acessível; fallback em `CatalogEntry`; `feedRanking` e `animeHashtag` como ponto de partida (com testes); área `/admin` separada com `requireAdmin`.

### C. O que deu bind parcial (39 linhas)
Busca, filtros e detalhe (TR-001/002/003/004/040/042/044/049); calendário — semana, estados de data, ação a partir do lançamento (TR-010/014/015/018); "Acompanhar" (TR-030); privacidade da lista (TR-036); feeds "Para você"/"Seguindo" (TR-051/052); publicação, associação, respostas, exclusão, repost, curtir (TR-060/062/063/065/068/069/070); hashtags (TR-071); perfil (TR-080); denúncia, moderação, tombstone (TR-091/093/094); notificações de lançamento (TR-100/103/105); tipografia japonesa, foco, alvos, estados, contraste, landmarks (TR-121/122/123/124/127/128); papéis no servidor (TR-131); HTML (TR-135).

### D. O que não deu bind (31 linhas, listadas todas)
- **Agenda, conta e acesso:** Dashboard (TR-020); Configurações (TR-021); preservar destino após o login (TR-033); contexto ao voltar (TR-057).
- **Feeds, busca e hashtags:** feed "Recentes" (TR-053); busca na Comunidade (TR-056); página de hashtag (TR-072); "Em alta" da hashtag (TR-074); navegação por hashtag/chip (TR-075).
- **Social:** bloqueio (TR-083); privacidade de perfil/listas (TR-084); @identificador (TR-085); aba "Discussões iniciadas" (TR-086); spoiler (TR-090) e marca do autor (TR-095); denúncia de resposta e perfil (TR-092); notificações sociais (TR-101), sino com dois canais (TR-102) e preferências (TR-104).
- **Admin de dados:** importar (TR-110), matching (TR-111), conflitos (TR-112), logs (TR-113), confirmar antes do commit (TR-114), catálogo (TR-118), jobs (TR-119).
- **Recursos da PoC sem elemento no Figma (4 "sem elemento" + 1 conceitual):** selo "NO AR" (TR-019), elenco/trailer (TR-047), upload (TR-136), rate limit (TR-133), testes/CI/documentação (TR-142); bootstrap do admin (TR-132, bind conceitual).
- *Nota:* "remover da lista" (TR-031) e "sem episódios assistidos" (TR-034) estão em **bind conceitual** (29 linhas), não em "sem bind": existe estrutura relacionada (API de remoção; modelo de consumo), mas semântica ou integração divergem.

### E. Divergências críticas (P0)
1. **TR-011** calendário atual vazio · 2. **TR-034** consumo vs "não registra episódios assistidos" · 3. **TR-003** sem detalhe público · 4. **TR-140** sem modelo canônico. Seguidas de P1: privacidade (`completed`), destino pós-login, Dashboard/home, hierarquia de título, fuso, franquia por regex, spoiler, bloqueio, Scrapers (D-30), bootstrap do admin, rate limit.

### F. Lacunas (98 no total)
Funcionais 29 · Visuais 17 · Técnicas 23 · Segurança/privacidade 16 · Testes 13. Por prioridade: **P0 = 4, P1 = 23, P2 = 51, P3 = 20** (`DOMAIN_AND_ARCHITECTURE_GAPS.md` §5). *(Na rev.1 eram 79; saíram 3 falsas lacunas de acesso ao Figma e entraram as lacunas reais do Figma e dos novos requisitos.)*

### G. Decisões necessárias (31; 1 resolvida)
**D-01 resolvida; D-02, D-03 e D-18 aprovadas pelo responsável em 2026-10-09** (a aprovação do *plano de migração* de D-02 segue pendente). Abertas: **P0 = 0**, **P1 = 13**, **P2 = 12**, **P3 = 2** (`OPEN_DECISIONS.md`). Em **22** das 30 abertas o Figma já toma posição (confirmar); **3** estão pendentes no próprio Figma (rascunhos, rate limits, visibilidade de seguidores); **4** são omissões novas (primeiro admin, ShareAction, extras do detalhe, contas) e **1** é conflito (scraping, D-30). As cinco pendências declaradas pelo relatório continuam pendentes; mídia (e avatar por upload) é contradita pelo código; edição de posts, posts salvos, chat, streaming e grupos privados não são.

### H. Próxima etapa recomendada
1. ~~Responder D-02, D-03, D-18~~ — **aprovadas em 2026-10-09**. Falta aprovar o plano de migração de D-02/D-18 e confirmar as posições do Figma nas demais (F0 do roteiro). Decidir **D-30** antes de qualquer trabalho de ingestão.
2. Fechar no Figma as lacunas FV-06/07/08/09/12 antes das fatias que dependem delas.
3. Aprovar (ou ajustar) esta auditoria.
4. Só então autorizar a **Fatia F1** (estabilização sem decisão nova: restaurar o calendário, tornar o health verdadeiro, remover `author.completed`, guardar `request.json()`, fechar o working tree com testes) e, em paralelo, as decisões P1 de segurança (D-04, D-21, D-22). Ver `IMPLEMENTATION_ROADMAP.md`.

## 7. Resumo quantitativo (como cada número foi calculado)

| Número | Valor | Cálculo / denominador |
| --- | --- | --- |
| Funcionalidades/comportamentos auditados | **108** | linhas da matriz `FIGMA_POC_TRACEABILITY.md` (IDs únicos TR-001…TR-142) |
| Estado: funcional / parcial / de outra forma / ausente / conflitante | **11 / 45 / 19 / 29 / 4** | contagem por coluna "Estado atual" (soma 108; 10,2% / 41,7% / 17,6% / 26,9% / 3,7%); "Visual apenas" e "Não verificável" = 0 |
| Correspondência: completa / parcial / divergente / inexistente | **9 / 39 / 29 / 31** | bind direto / parcial / conceitual / sem bind (8,3% / 36,1% / 26,9% / 28,7% de 108) |
| Origem no Figma: inspecionada / sem elemento | **103 / 5** | as 103 têm nó citado; as 5 são extras da PoC ou regras técnicas |
| Prioridade P0 / P1 / P2 / P3 | **4 / 29 / 63 / 12** | coluna "Prio" da matriz (soma 108) |
| Afirmações do relatório de entrega (14): confirmadas / parcial / não confirmadas / não verificáveis | **13 / 1 / 0 / 0** | `FIGMA_INVENTORY.md` §2 |
| Figma: páginas / frames / componentes / fluxos | **17 / 61 / 55 / 14** (8 sociais + 6 protótipos) | contagem direta do XML do arquivo |
| Fluxos analisados / completo / parcial / ausente | **18 / 1 / 10 / 7** | `UX_FLOW_AUDIT.md` §3.1 (denominador = fluxos, não telas); todos os 14 fluxos do Figma são "documentados, não conectados" |
| Requisitos especificados | **68** | blocos `####` de `FUNCTIONAL_SPEC.md` |
| Lacunas / por categoria | **98** (F 29, V 17, T 23, S 16, Q 13) | linhas `GAP-*` de `DOMAIN_AND_ARCHITECTURE_GAPS.md`; prioridades P0 4 / P1 23 / P2 51 / P3 20 |
| Decisões / por prioridade | **31** (1 resolvida; abertas: P0 3, P1 13, P2 12, P3 2) | fichas `D-xx` de `OPEN_DECISIONS.md` |
| Testes executados | unitários **168/168 ✔**, `tsc` **0**, lint **6 erros + 1 aviso preexistentes** | Playwright **não executado** (§4) |

## 8. Mapa dos artefatos (em `docs/audit-figma-poc/`)

| Arquivo | Conteúdo |
| --- | --- |
| `AUDIT_SUMMARY.md` | Este resumo executivo (rev.2) |
| `FIGMA_INVENTORY.md` | Inventário real do Figma (17 páginas, 61 frames, 55 componentes), correção do acesso, confirmação do relatório, tokens, contrastes e inconsistências FV-01…16 |
| `POC_INVENTORY.md` | Stack, rotas, componentes, API, serviços, dados, auth, testes, execução, working tree |
| `FIGMA_POC_TRACEABILITY.md` | Matriz de 108 linhas (13 colunas) + resumo quantitativo gerado do dado |
| `DOMAIN_AND_ARCHITECTURE_GAPS.md` | Domínio de anime e social, regras críticas, arquitetura e 98 lacunas A–E |
| `FUNCTIONAL_SPEC.md` | 68 requisitos (confirmado/observado/divergência/proposta/pendente/não verificado), resumo por épico e contrato de 12 telas |
| `UX_FLOW_AUDIT.md` | 18 fluxos (14 do Figma), destinos, estados, retornos e prontidão para prototipar |
| `OPEN_DECISIONS.md` | 31 decisões (D-01 resolvida), posição do Figma em cada uma, verificação das cinco pendências, 15 conflitos |
| `VALIDATION_PLAN.md` | O que foi executado, pré-requisitos e plano funcional/integração/aceite por fluxo/regressão/a11y/segurança/UX |
| `IMPLEMENTATION_ROADMAP.md` | 16 fatias verticais (F0–F15), dependências ajustadas à realidade; **não é autorização** |

**Documentos existentes reutilizados/atualizados:** nenhum — o repositório não tinha pasta `docs/`; `README.md` é o boilerplate do `create-next-app`; `AGENTS.md`/`CLAUDE.md` só avisam sobre o Next. Todos os arquivos acima são novos.

## 9. Pedido de revisão
Peço que o responsável pelo ANIME HUB (1) confirme ou corrija as prioridades, (2) responda D-02/D-03/D-18 e **D-30**, (3) confirme as posições do Figma nas demais decisões ou indique onde divergir, (4) indique se as 30 decisões abertas devem ser tratadas na ordem de `OPEN_DECISIONS.md` e (5) autorize explicitamente — ou não — qualquer fatia do roadmap. **Nada foi implementado.**

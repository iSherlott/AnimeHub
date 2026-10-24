# Varredura dos dados das obras — 23/10/2026

Varredura somente leitura no banco de desenvolvimento (notebook, schema `animehub`). Nada foi alterado. A lista completa de
ids de cada achado está em [`varredura-2026-10-23.json`](varredura-2026-10-23.json).

**O que foi lido:** 16.982 obras do catálogo (15.121 na plataforma), 8.055 franquias, 798 obras da sua lista, 618
episódios gravados, 41.911 horários do calendário, 7.950 produções da página pública, 12.371 sinopses traduzidas, os
vínculos de reboot e os arcos.

## O que passou sem nenhum problema

- Nenhuma obra com gênero Hentai na plataforma; nenhum título vazio ou com código HTML.
- Tipo × formato: todas as obras com formato têm o tipo certo (Série, OVA, ODA, Filme, Outros).
- Nenhuma nota fora da faixa (AniList 0–100, site 0–10), nenhum número de episódios zero ou negativo.
- Nenhuma obra "finalizada" com estreia no futuro, nenhuma "em exibição" que só estreia no futuro.
- **Linha do tempo:** nenhuma posição repetida, nenhuma temporada repetida ou pulada, nenhuma franquia fora da ordem de
  estreia, nenhuma série fora de linha do tempo; relações todas em JSON válido.
- **Reboots e arcos:** todos os vínculos apontam obras da plataforma; nenhum arco passa do número de episódios.
- **Sua lista:** todas as 798 obras existem no catálogo; nenhuma nota pessoal fora de 1–10.
- **Calendário:** nenhum horário atual (últimos 60 dias ou futuro) além do total de episódios; nenhuma obra finalizada
  com episódio marcado para o futuro.

## Achados

Gravidade: **crítico** = fere a regra da plataforma; **alto** = dado errado que aparece na tela; **médio** = dado
faltando ou desatualizado que aparece na tela; **baixo** = cosmético ou já está na fila da curadoria.

### Crítico

| Achado | Qtd. | Detalhe |
|---|---:|---|
| Marcadas como adultas pela curadoria, mas ainda na plataforma | 4 | Ingoku Danchi (206166), Kyojinzoku no Hanayome (116648), Saezuru Tori wa Habatakanai: Don't stay gold (115567), To LOVE-Ru: Multiplication (100659). A pendência ADULT_REMOVED está aberta, mas a obra não saiu. **Decisão sua:** tirar ou dispensar a pendência. |

### Alto

| Achado | Qtd. | Causa provável | Correção |
|---|---:|---|---|
| Temporada não bate com a data de estreia | 55 | Dado da fonte (ex.: Koisuru Shirokuma "Primavera 2017" com estreia em 13/10/2017; City Hunter: Ryou no Propose "Verão 2015" com estreia em 2016). Dezembro como inverno do mesmo ano foi aceito (convenção antiga da fonte). | Só revisão manual; a fonte é a AniList/AniDB. |
| Sinopse sem conteúdo ("N/A", "261-263", "saison 3", "Claymation.") | 16 | Texto vazio vindo da fonte, exibido como se fosse sinopse. | Tratar como "sem sinopse" (apagar o texto). |
| Sinopse em português idêntica à original | 20 | Quase todas são as sinopses sem conteúdo acima. | Some com a correção anterior. |
| Ano da temporada longe do ano de estreia (estreia só com o ano) | 10 | Dado da fonte (ex.: Trip Trek "Primavera 2013" × 2003; Hulu Xiongdi 2008 × 1986). | Revisão manual. |
| Começo depois do fim | 4 | Dado da fonte (ex.: #Kanagawa ni Sunderu Elf, estreia 04/12/2025 e fim 17/03/2025). | Revisão manual ou nova consulta à AniList. |
| "Ainda não lançada", mas estreou há mais de 2 semanas | 3 | Projetos parados na fonte: CHIKA☆CHIKA IDOL (2016), Yousei Chiitan☆ (2019), Yao Wen Lu (2020). | Nova consulta à AniList; se continuar igual, deixar. |
| Lista de episódios vai além do total da obra | 2 | Tensei Shitara Ken Deshita 2nd Season (12 episódios, 32 gravados) e Tempal (12, 22 gravados): a Kitsu devolveu episódios a mais, sem nome nem data. Aparecem na página da obra. | Cortar os episódios além do total (código + dado). |
| "Em exibição", mas terminou há mais de 30 dias | 1 | Anime Kaisha de Hanasu Koto ka yo (fim 25/02/2022). | Nova consulta à AniList. |
| Tradução bem mais curta que o original | 1 | The IDOLM@STER Cinderella Girls: Starlight Stage (264 de 610 caracteres). | Traduzir de novo. |
| Obra da sua lista que saiu da plataforma | 1 | Rescue ME! (18039). **Decisão sua:** trazer de volta ou tirar da lista. |

### Médio

| Achado | Qtd. | Causa | Correção |
|---|---:|---|---|
| Sem sinopse em nenhum idioma | 1.278 | Fonte sem sinopse (já na curadoria como SYNOPSIS_EN_MISSING). | Fila da curadoria. |
| Página pública sem o ano da temporada (o catálogo tem) | 1.056 | A produção (página `/obra`) guardou o ano vazio; o catálogo deduziu o ano. A ficha da página pública mostra a época em branco. | A página cair para o dado do catálogo quando a produção não tiver. |
| Sua lista sem o formato | 798 | O formato nunca é copiado para a lista; a página da obra mostra "Série" em vez de "Série (TV)". | A página usar o formato do catálogo. |
| Próximo episódio com data já passada | 90 | O carregador do calendário ficou sem banco enquanto o notebook esteve fora; tende a se corrigir sozinho no próximo ciclo. | Conferir de novo depois de um ciclo. |
| Sem formato / sem tipo | 42 | Obras só do AniDB sem formato (já na curadoria como KIND_UNKNOWN). | Fila da curadoria. |
| Fim gravado só com o ano (1º de janeiro), antes da estreia | 18 | A fonte só sabia o ano do fim e ele virou 1º de janeiro (ex.: Xi Yang Yang, estreia 12/02/2015, fim 01/01/2015). | Apagar o fim nesses casos. |
| Sem capa | 10 | Obras só do AniDB. | Fila da curadoria. |
| Sua lista sem temporada/ano (7), produção sem episódios (7) | 14 | Cópia desatualizada. | Mesma correção da página (cair para o catálogo). |
| Gênero antigo "Supernatural" na sua lista | 4 | Higurashi, Higurashi Kai, Fate/stay night UBW, Another: gênero que saiu da lista de 18. | Recalcular os gêneros dessas 4. |
| Filme finalizado sem número de episódios | 3 | Filmes recentes sem o dado na fonte. | Deixar (filme = 1). |

### Baixo

| Achado | Qtd. | Observação |
|---|---:|---|
| Sinopse com marca de fonte ("(Source: …)", "(Fonte: …)") | 7.841 / 8.091 | Aparece no fim do texto; é o crédito da fonte. Dá para esconder na exibição se quiser. |
| Sem gênero da lista da plataforma | 3.461 | Já na curadoria (NO_GENRE). |
| Horários antigos de episódio além do total da obra | 689 | Histórico (antes dos últimos 60 dias) que a AniList guardou com numeração contínua; não aparece no calendário atual. |
| Sinopse muito curta (menos de 40 caracteres) | 405 | Texto curto da fonte. |
| Episódio sem nome | 402 | Episódios que a fonte não nomeou. |
| Filme com várias partes | 23 | Coletâneas do AniDB (ex.: Persona 3 the Movie com 4 filmes); não é erro. |
| Título da sua lista diferente do catálogo | 2 | Grafia antiga (Bishoujyo × Bishoujo Muzai Pirates). |

## Aplicado em 23/10/2026

- **Fichas caem para o catálogo** (código, `workFacts` em `src/lib/workLabels.ts`): a página da obra da sua lista e a
  página pública completam com o catálogo o tipo, a situação, a época e os episódios que a cópia não tem. As 1.056 páginas
  públicas sem época e as 798 obras da lista sem formato passam a mostrar o dado ("Série (TV)", "Inverno 2025"). Os
  números da varredura continuam iguais porque medem a cópia gravada, não o que a página mostra.
- **Reconsulta à AniList** (situação, datas, episódios e próximo episódio; título, sinopse, gêneros e tipo não foram
  tocados): **90 obras** com o próximo episódio parado foram atualizadas (ex.: Shiguang Dailiren III passou a
  finalizada; Romelia Senki e Choujun! Choujou Senpai ganharam o total de episódios) e 2.083 horários do calendário foram
  regravados. As 4 com situação parada e as 4 com começo depois do fim continuam iguais: é assim que estão na AniList.
- **Tradução apagava japonês** (código, `src/lib/translate.ts`): ao procurar a tradução cortada, apareceu a causa geral:
  o LibreTranslate apaga os trechos em japonês/chinês que vêm dentro da sinopse em inglês. Afetava **128 sinopses**
  (todas as que tinham japonês). Agora esses trechos saem antes da tradução e voltam intactos; se o tradutor perder um
  marcador, a tradução falha em vez de sair faltando pedaço. **122 foram retraduzidas**; 6 seguem com a tradução antiga
  porque o tradutor mexeu nos marcadores (Temple Specials, Galo Sengen, Douluo Dalu: Zhangu Zsn Xie, Wedding Peach
  Specials, MIRU: Watashi no Mirai, Yuru Camp△ OVA).

- **Conteúdo adulto como categoria** ([ADR 0006](../adr/0006-conteudo-adulto-como-categoria.md)): as 4 obras marcadas
  como adultas ficaram na plataforma com o gênero Hentai e o aviso "+18" na página; a regra "nenhum hentai" foi trocada
  por essa (bloqueio desligado em `contentPolicy`).

Depois disso, a varredura repetida: próximo episódio parado 90 → 0, tradução cortada 1 → 0, produção sem episódios 7 → 6.

## Como foi feito

Script somente leitura (runner temporário do Vitest no banco de dev, apagado depois), com estas regras: política de
conteúdo, títulos, sinopse (vazia, sem tradução, igual ao original, ainda em inglês, cortada, sem conteúdo), tipo ×
formato, episódios, situação × datas, temporada × estreia (aceitando o mês vizinho), próximo episódio, capa, notas,
gêneros, relações, linha do tempo por franquia (posição, temporadas, ordem de estreia), reboots e arcos, sua lista contra o
catálogo, episódios gravados, calendário e página pública contra o catálogo. Achados de regras que davam falso positivo
(datas só com o ano, dezembro como inverno, títulos em inglês dentro de sinopses traduzidas) foram corrigidos antes deste
relatório.

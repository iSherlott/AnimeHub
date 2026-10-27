# ADR 0011 — Comunidades dos animes (fórum estilo Orkut)

Status: aceito em 26/10/2026.

## Contexto

Cada obra tinha duas conversas planas: as "Discussões" (publicações do feed ligadas à obra) e os "Comentários" de quem
acompanha. Não havia o fórum de cada anime — tópicos com título, respostas dentro do tópico, membros e enquetes — como
as comunidades do Orkut. Decisões da pessoa usuária:

- uma comunidade por anime, isto é, por **franquia** (temporadas, OVAs e filmes juntos);
- ler é público; criar tópico, responder e votar exige **entrar na comunidade** ("Participar"), sem exigir acompanhar a obra;
- primeira versão: tópicos e respostas, enquetes e a página "Minhas comunidades";
- os "Comentários" e as "Discussões" continuam como estão.

## Decisão

- **Franquia = `CatalogEntry.franchiseKey`** (Epic 45), a do catálogo canônico. Ela cobre toda obra com AniList ID; a
  franquia das produções (`Franchise`) cobre só as obras com produção e discorda dela em ~180 grupos. Obra sem franquia
  (só do AniDB/Kitsu, ou ainda não curada) tem a comunidade dela (`Community.catalogEntryId`).
- **Endereço:** `/comunidades/<chave>`, em que a chave é a da franquia (o menor AniList ID do grupo) ou `anidb-<id>`.
  Qualquer obra da franquia leva a ele (redirecionamento permanente).
- **A chave pode mudar** (uma obra mais antiga entra no grupo e o menor AniList ID muda). Por isso a comunidade é achada
  por qualquer obra da franquia (`franchiseKey` em qualquer AniList ID do grupo, ou `catalogEntryId` em qualquer obra
  dele). Se houver mais de uma, a mais antiga fica e as outras entregam tópicos e membros a ela (`findCommunity`).
- **Ligar uma obra do AniDB à AniList** leva a comunidade junto (`moveCatalogCommunity`); quando a obra de destino ganha
  franquia, a busca a reajusta para a da franquia.
- **Criada na primeira participação** (entrar na comunidade): visitar não cria nada.
- **Tópicos:** título (até 120), mensagem (até 5.000), spoiler, "Sobre" (a obra da franquia de que fala, opcional) e
  enquete opcional (2 a 10 opções). A lista ordena pela última atividade (criação ou resposta). Respostas até 3.000,
  paginadas de 30 em 30.
- **Enquete:** um voto por pessoa, sem troca; o resultado aparece para todos.
- **Editar:** só quem escreveu. **Apagar:** quem escreveu ou a equipe com a permissão `moderation` (fica guardado com
  `deletedAt` e some da página). Denúncia, fixar e trancar ficaram fora desta versão.
- **Bloqueios:** tópicos e respostas de quem a pessoa bloqueou (ou que a bloqueou) não aparecem.
- **Minhas comunidades** (`/comunidades`): as comunidades em que a pessoa entrou, com quantos tópicos tiveram atividade
  depois da última visita (`CommunityMember.lastVisitAt`, atualizado ao abrir a comunidade ou um tópico).
- **Na página da obra:** o cartão "Comunidade do anime", com os números, os três tópicos mais ativos e o link.

## Consequências

- Migração `20261106100000_communities`: só cria tabelas (`Community`, `CommunityMember`, `CommunityTopic`,
  `CommunityReply`, `CommunityPoll`, `CommunityPollOption`, `CommunityPollVote`).
- O spoiler é escondido na tela (o texto vai na página); diferente das publicações do feed, que só liberam o texto por
  uma rota própria.
- Pendências possíveis: aviso de resposta nos tópicos em que a pessoa participou; busca dentro do fórum (feitos na revisão "Avisos e busca", abaixo).

## Revisão de 26/10/2026 — formato do Orkut

O menu principal passou a ter **Feed** (as publicações, antes "Comunidade") e **Comunidades** (o fórum de cada anime).

- **Layout em 3 colunas, como no Orkut** (`src/app/comunidades/[key]/layout.tsx`): à esquerda a capa, o nome, os números,
  "Participar" e o menu (Início · Fórum · Enquetes · Eventos · Membros); no centro a seção aberta; à direita a grade de
  membros (9, com "ver todos") e as **comunidades relacionadas** (outras franquias com o mesmo gênero principal, das mais
  populares).
- **Início:** descrição (a da comunidade ou, sem ela, a sinopse da obra principal), informações (categoria, franquia,
  idioma, tipo, criada em), os tópicos mais ativos, as enquetes e os próximos eventos.
- **Moderação** (permissão `moderation`): fixar (fica no topo do fórum) e trancar (não aceita respostas nem votos),
  editar a descrição e resolver as **denúncias** de tópicos e respostas em Admin → Acesso e moderação (remover ou manter;
  resolver fecha todas as denúncias do mesmo conteúdo). Qualquer pessoa com conta denuncia, com o motivo.
- **Eventos:** título, descrição, início e fim (digitados no fuso da conta, gravados como instante), onde; presença
  "Vou"/"Talvez" (só membros; quem cria já vai); próximos e passados; apagar é de quem criou ou da moderação.
- **Diretório** (`/comunidades`): Minhas (com novidades desde a última visita), Populares (mais membros) e Buscar (pelo
  nome do anime; cada anime tem a sua comunidade mesmo antes do primeiro membro).
- Migração `20261107100000_community_orkut`: descrição, `pinnedAt`/`lockedAt`, `CommunityEvent`,
  `CommunityEventRsvp` e `CommunityReport`. Só acrescenta.

## Revisão de 26/10/2026 — avisos e busca

- **Avisos no sino** (canal Social):
  - **Resposta num tópico** em que a pessoa participa, isto é, que ela criou ou em que respondeu. Enquanto o aviso
    daquele tópico não é lido, ele não se repete: só passa a mostrar quem respondeu por último. O aviso leva à última
    página do tópico, direto na resposta.
  - **Evento novo** numa comunidade da pessoa: avisa todos os membros, menos quem criou o evento.
  - O aviso mostra o título do tópico ou do evento e o nome da comunidade. Esses títulos já aparecem para todos na
    lista do fórum; o texto das mensagens nunca entra no aviso.
  - Bloqueio entre as duas pessoas impede o aviso.
  - Tópico ou evento apagado aparece como "removido".
- **Preferência "Comunidades"** em Configurações, ativada por padrão. O botão "Desativar todo o Social" também a
  desliga.
- **Busca no fórum** (`/comunidades/<chave>/forum?q=`):
  - procura no título, no texto e nas respostas visíveis dos tópicos daquela comunidade;
  - todas as palavras precisam aparecer;
  - ignora palavras de uma letra e usa no máximo 6;
  - a paginação mantém a busca.
- Migração `20261109100000_community_notifications`: `User.notifyCommunity` e `topicId`/`replyId`/`eventId` em
  `SocialNotification`. Só acrescenta.
- Testes: spec 122 e `community.test.ts`; spec 52 ajustado.

## Revisão de 26/10/2026 — comunidades no Feed

- **Atalho nas publicações.** A publicação sobre uma obra mostra "Comunidade →" ao lado do link da obra.
  - O atalho só aparece quando a obra está no catálogo (`PostDTO.hasCommunity`), porque obra fora do catálogo não tem
    comunidade.
  - Ele leva a `/comunidades/<obra>`, que redireciona para o endereço da franquia.
- **Lateral do Feed.** A caixa "Nas suas comunidades" mostra os 5 tópicos de atividade mais recente nas comunidades em
  que a pessoa participa, sem autores com bloqueio.
  - Cada tópico mostra a comunidade, o título e quantas respostas tem, e leva à última página do tópico.
  - No fim fica o link "Minhas comunidades".
- **Código e testes.** `activeTopicsForMember` e a rota `/api/communities/active-topics`. Sem migração. Testes: spec 129.

## Revisão de 27/10/2026 — denúncia de eventos

- **Denunciar eventos.** Eventos podem ser denunciados, com o motivo escrito, como os tópicos.
- **Fila.** A denúncia vai para a fila das comunidades em Acesso e moderação.
- **Remover.** Apaga o evento e fecha todas as denúncias dele.
- **Banco.** Coluna `CommunityReport.eventId`, na migração `20261116100000_reports_events_albums`.
- **Testes.** Spec 132.

## Revisão de 27/10/2026 — a comunidade substitui os comentários da obra

- **A página da obra tem só o caminho para a comunidade.** "Comentários" (de quem acompanha) e "Discussões sobre esta
  obra" (publicações do Feed) saíram. A aba "Comunidade" leva ao cartão da comunidade da franquia (números, tópicos mais
  ativos e "Abrir a comunidade").
- **Dados preservados.** Nada foi apagado: os comentários continuam no banco e na API, e as publicações sobre a obra
  continuam no Feed.
- **Testes.** Spec 133; os specs 18, 21 (removido), 42, 55, 81 e 116 foram ajustados.

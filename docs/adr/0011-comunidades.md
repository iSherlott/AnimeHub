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
- Pendências possíveis: denunciar tópico/resposta na fila da moderação; fixar e trancar tópicos; aviso de resposta nos
  tópicos em que a pessoa participou; busca no fórum.

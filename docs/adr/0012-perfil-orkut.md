# ADR 0012 — Perfil no formato do Orkut

Status: aceito em 26/10/2026.

## Contexto

O perfil tinha o cabeçalho (capa, avatar, nome, bio, seguir) e as abas Publicações, Discussões e Animes. A pessoa usuária
pediu o perfil no formato do antigo Orkut, com o tema do Anime Hub, e escolheu:

- **recados** (scrapbook): qualquer conta deixa um recado no perfil de outra;
- **depoimentos**: escritos por amigos, aparecem só depois que a pessoa aprova;
- **fãs e avaliações**: "ser fã" e notas de amigos (como confiável/legal/sexy, com o tema do site);
- **quem sou eu + sorte do dia**;
- **amigos = o seguir que já existe**: amigo é quem se segue mutuamente. Não há pedido de amizade.

## Decisão

- **Layout em 3 colunas**, igual ao das comunidades (ADR 0011):
  - esquerda: menu das seções, fãs e avaliações;
  - centro: o cabeçalho de antes (sem a bio), a sorte do dia, o quem sou eu, os recados, os depoimentos e as abas de
    antes (Publicações, Discussões, Animes);
  - direita: amigos (9, com "ver todos"), comunidades em que a pessoa entrou e conquistas (títulos dos quizzes).
- **Quem sou eu.** A bio de antes, mais anime e personagem favoritos (texto livre, até 80 caracteres) e até 5 gêneros
  favoritos (do vocabulário de gêneros, sem Hentai). Tudo opcional, em Editar perfil.
- **Sorte do dia.** Só a dona do perfil vê, como no Orkut. As 30 frases são do Anime Hub; nenhuma cita uma obra. A frase
  depende da pessoa e do dia no fuso de quem vê (`src/lib/dailyFortune.ts`).
- **Recados.** Até 1.000 caracteres, 20 por minuto por conta. Apagar: quem recebeu, quem escreveu ou a moderação; o
  recado fica marcado como apagado. O perfil mostra os 5 últimos; `/users/<id>/recados` mostra todos, 20 por página.
- **Depoimentos.**
  - Só amigos escrevem, até 2.000 caracteres e um por amigo.
  - Reescrever volta a esperar a aprovação.
  - A dona aprova ou recusa. Quem visita vê só os aprovados.
  - Quem escreveu ou quem recebeu pode apagar.
- **Fãs.** Qualquer conta pode ser fã, menos de si mesma. Os fãs aparecem só como contagem.
- **Avaliações.** Só amigos avaliam. São três notas de 0 a 3 cada:
  - Otaku raiz;
  - Gente boa;
  - Sem spoiler.

  O perfil mostra a média e quantos avaliaram. Quem avaliou pode mudar as notas.
- **Bloqueio.** Com bloqueio entre as duas pessoas, não há recado, depoimento, fã nem avaliação, e o que a pessoa
  bloqueada escreveu some para quem bloqueou.
- **Notificações (sino).**
  - Recado e depoimento seguem a preferência de comentários e levam a `#recados` / `#depoimentos`.
  - Virar fã segue a de seguidores, sem repetir.
- **"Minhas conquistas"** saiu do menu do avatar e agora fica no perfil: na caixa de conquistas e na aba de antes.

## Consequências

- **Banco.** `20261108100000_profile_orkut` só acrescenta:
  - os favoritos em `User`;
  - as tabelas `Scrap`, `Testimonial`, `Fan` e `ProfileRating`.
- **Código.**
  - Regras: `src/lib/profileOrkut.ts`.
  - Rotas: `/api/users/<id>/scraps`, `/testimonials`, `/fan`, `/rating`, `/api/scraps/<id>` e `/api/testimonials/<id>`.
- **Testes.** Spec 121 e `src/lib/dailyFortune.test.ts`. O spec 70 foi ajustado ao novo rótulo "Quem sou eu".
- **Fora desta versão.**
  - Pedido de amizade separado do seguir.
  - Lista de quem é fã.
  - Responder recado no perfil de quem escreveu, num clique.

## Revisão de 26/10/2026 — amizade separada do seguir

A pessoa usuária escolheu trocar o "amigo = seguir mútuo" por **pedido de amizade**, como no Orkut.

- **Pedir e responder:**
  - "Adicionar como amigo" fica no cabeçalho do perfil, ao lado de "Seguir perfil".
  - Quem recebe aceita ou recusa no próprio perfil de quem pediu ou na página **Amigos** (`/amigos`, também no menu da
    conta). A página lista os pedidos recebidos, os enviados e os amigos.
  - Quem pediu pode cancelar. Qualquer um dos dois pode desfazer a amizade.
  - Se as duas pessoas pedirem, vira amizade direto.
- **Seguir continua independente:** monta o "Seguindo" do Feed e não cria nem desfaz amizade.
- **O que exige amizade:** depoimentos e avaliações, como antes, agora pela amizade.
- **Grade de amigos:** mostra as amizades. No próprio perfil, a caixa de amigos avisa dos pedidos esperando e leva a
  `/amigos`.
- **Sino:**
  - "quer ser seu amigo" leva a `/amigos`;
  - "aceitou seu pedido de amizade" leva ao perfil de quem aceitou;
  - os dois seguem a preferência de seguidores e não se repetem.
- **Bloqueio:** desfaz a amizade e apaga os pedidos entre as duas pessoas; com bloqueio, não há pedido novo.
- **Banco** (`20261110100000_friendships`): cria `Friendship` e `FriendRequest`. A `Friendship` guarda um registro por
  par, com o menor id em `userAId`. A migração transforma em amizade quem já se seguia mutuamente, para ninguém perder
  depoimentos ou avaliações. Ela só acrescenta.
- **Código e testes:** as regras ficam em `src/lib/friends.ts`. Testes: spec 123, que inclui a carga da migração; o spec
  121 foi ajustado.

## Revisão de 26/10/2026 — moderação dos perfis

- **Denunciar.** Recados e depoimentos aprovados têm o botão "Denunciar", com o mesmo fluxo das publicações:
  - um dos motivos fixos (spam, assédio, spoiler sem aviso, outro);
  - uma confirmação;
  - o retorno discreto "Denunciado".
- **Regras.**
  - Quem escreveu não denuncia o próprio conteúdo.
  - Depoimento pendente não é denunciável: quem recebe recusa.
  - Cada pessoa tem no máximo uma denúncia aberta por conteúdo.
  - Até 20 denúncias por minuto por conta.
- **Fila.** Admin → Acesso e moderação ganhou "Denúncias dos perfis" (permissão `moderation`).
  - **Remover** esconde o recado (marcado como apagado) ou o depoimento (status `REMOVED`) e fecha todas as denúncias
    abertas do mesmo conteúdo.
  - **Manter** fecha as denúncias sem mexer no conteúdo.
  - Quem resolveu e a ação (`REMOVED`/`KEPT`) ficam registrados.
- **Banco.** `20261111100000_profile_reports` cria `ProfileReport` e só acrescenta.
- **Testes.** Spec 124.

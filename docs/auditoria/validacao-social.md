# Validação da parte social (comunidades e perfil) — 28/10/2026

Pedido: validar cada recurso da comunidade que tem equivalente no Orkut. O Orkut era a referência das decisões dos
ADRs 0011 (comunidades) e 0012 (perfil social). A validação passou pela parte social inteira, porque perfil e
comunidade são as duas metades dessa referência.

## Como foi validado

1. **Recurso por recurso:** cada recurso do Orkut foi conferido contra o que o AnimeHub tem (código e decisão do ADR)
   e contra o teste de ponta a ponta que o exercita.
2. **Tour com dados realistas:** um spec temporário semeou uma comunidade viva e um perfil completo.
   - Comunidade: 3 membros, 6 tópicos (um fixado, um trancado, um com spoiler, um com enquete), 34 respostas (duas
     páginas), evento, denúncia e comunidade relacionada.
   - Perfil: amizade, pedido pendente, recados longos, depoimento aprovado, fã, avaliações, quem sou eu, aniversário
     e visita.
   - O tour passou por **21 telas em 3 tamanhos** (1280, 820 e 390 px): 61 capturas, já que a moderação foi vista só
     no computador.
   - Em cada tela mediu: status, rolagem lateral, elemento saindo da tela, erros do console, quantidade de `<h1>` e de
     `<main>`.
   - Resultado: **0 problemas medidos nas 61**. Os achados abaixo vieram da revisão visual das capturas.
3. **Suíte:** os specs da parte social (117, 120–132, 136) e a suíte inteira passam.

## Comunidades

| Recurso do Orkut | No AnimeHub | Situação | Teste |
|---|---|---|---|
| Diretório e busca de comunidades | `/comunidades`: Minhas (com novidades), Populares, Buscar pelo nome do anime | ✔ | 120 |
| Criar comunidade | Uma por anime (franquia), criada na primeira participação | ✔ por decisão (ADR 0011) | 117 |
| Página da comunidade: foto, descrição, categoria, idioma, tipo, criada em | Capa, descrição (ou sinopse), informações | ✔ | 120 |
| Participar / sair | "Participar" / "Sair da comunidade" | ✔ | 117 |
| Fórum: tópicos, respostas, paginação | Tópicos por última atividade, respostas de 30 em 30, editar e apagar o seu | ✔ | 117 |
| Busca no fórum | `?q=` no título, no texto e nas respostas | ✔ | 122 |
| Enquetes | No tópico, 2 a 10 opções, um voto por pessoa, resultado para todos | ✔ | 117 |
| Eventos com presença | Próximos e passados, "Vou" / "Talvez", onde, fim opcional | ✔ | 120 |
| Membros | Grade de 9 e "ver todos" | ✔ | 120 |
| Comunidades relacionadas | Mesmo gênero principal, mais populares | ✔ | 120 |
| Comunidades no perfil do membro | Caixa "comunidades" no perfil | ✔ | 121 |
| Atualizações | Sino: resposta em tópico em que participa, evento novo; lateral do Feed | ✔ | 122, 129 |
| Moderação: apagar, fixar, trancar, denunciar | Equipe com permissão `moderation`; fila em Acesso e moderação | ✔ | 120, 132 |
| Dono e moderadores próprios da comunidade | — (a moderação é a equipe do site) | ✘ não existe | — |
| Banir membro da comunidade | — | ✘ não existe | — |
| Última mensagem do tópico ("por fulano") | A lista mostra respostas e quando, sem quem respondeu por último | ◐ parcial | — |

## Perfil social

| Recurso do Orkut | No AnimeHub | Situação | Teste |
|---|---|---|---|
| Recados (scrapbook) | Escrever, responder no perfil de quem escreveu, conversa entre os dois, apagar, denunciar | ✔ | 121, 126, 124 |
| Depoimentos | Só amigos, aprovação da dona, reescrever volta à aprovação | ✔ | 121 |
| Fãs | "Ser fã", contagem e lista | ✔ | 121, 126 |
| Avaliações (confiável / legal / sexy) | Otaku raiz / Gente boa / Sem spoiler, de amigos, média | ✔ | 121 |
| Sorte do dia | Só a dona vê, frase por pessoa e dia | ✔ | 121 |
| Quem sou eu | Bio, anime e personagem favoritos, gêneros | ✔ | 121 |
| Amigos | Pedido de amizade, página Amigos, busca, sugestões | ✔ | 123, 125 |
| Visitas ao perfil | Só a dona vê, 90 dias, reciprocidade | ✔ | 128 |
| Aniversários | Dia e mês, só amigos, sino e lateral do Feed | ✔ | 127 |
| Álbuns de fotos | Álbuns de **animes** (sem fotos, por decisão) | ✔ por decisão (ADR 0012) | 130 |
| Mensagens privadas | — | ✘ não existe | — |
| Amigos em comum no perfil de outra pessoa | — (aparece só nas sugestões: "2 comunidades em comum") | ◐ parcial | 125 |

## O que a validação achou e foi corrigido

- **Textos de antes do sistema fechado:**
  - A comunidade dizia "tipo: pública (qualquer pessoa lê…)".
  - A conversa de recados dizia "Recados são públicos".
  - O perfil se apresentava como "Seu espaço público" / "Perfil público".
  - Editores, Feed e hashtag falavam em "publicação pública" e "conversas públicas".
  - Admin → Acesso e moderação ainda dizia "Cadastro é só por convite… usa em /signup".

  Agora todos dizem que o conteúdo fica à vista de quem tem conta.
- **Evento no mesmo dia** repetia a data ("sáb., 01 de fev. · 17:00 até sáb., 01 de fev. · 23:00"). Agora é "17:00 às
  23:00".
- **Contagem solta "(3)"** nas comunidades relacionadas e nas comunidades do perfil. Agora é "3 membros".
- **Enquete:** o fundo da barra era vermelho-escuro, e a opção com 0% parecia uma barra cheia. O fundo agora é neutro.
- **Tablet:** a coluna da direita ocupa a largura toda e as grades de 3 colunas esticavam, deixando a capa da comunidade
  relacionada gigante. As grades (membros, relacionadas, amigos, comunidades do perfil) passaram a ter colunas de
  largura fixa, repetidas conforme o espaço.

O spec 120 ganhou as verificações do evento, da contagem e do tipo.

## Para decidir

1. **Dono e moderadores por comunidade.** No Orkut, quem criava a comunidade a moderava e nomeava moderadores. Aqui a
   comunidade é de todos os fãs do anime e a moderação é da equipe. Dá para ter moderadores por comunidade, nomeados
   pela equipe.
2. **Banir membro.** Hoje a equipe remove tópicos e respostas, mas não impede alguém de voltar a escrever numa
   comunidade.
3. **Mensagens privadas.** O AnimeHub tem recados e a conversa entre duas pessoas, ambos à vista de quem tem conta. Não
   existe mensagem só entre as duas.
4. **"Última resposta por fulano"** na lista do fórum e **amigos em comum** no perfil de outra pessoa: são pequenos e
   não exigem mudar o banco.

Observação dos dados de teste: os álbuns automáticos do usuário de teste aparecem com 0 animes porque os animes dele não
têm situação (no ar, terminado). Com dados reais, a situação vem da agenda e do catálogo. Não é um defeito.

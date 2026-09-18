/**
 * Popula o banco de DEV com 10 contas sintéticas (posts, favoritos,
 * progresso, comentários, curtidas e follows entre elas — e seguindo a
 * conta real) pra simular um app com mais gente, e dar material real pra
 * revisar backlog/UX. Rode com: npm run seed:community
 *
 * Idempotente: sempre apaga as 10 contas de demo (por e-mail fixo) antes
 * de recriar — cascata pelas relações do schema cuida do resto (Anime,
 * Post, Comment, WatchProgress, PostLike, Follow).
 */
const path = require("node:path");
const { PrismaClient } = require(
  path.join(__dirname, "..", "node_modules", "@prisma", "client")
);

// Sem datasourceUrl explícita — a Prisma Client já lê ANIME_HUB_DATABASE_URL
// do .env na raiz do projeto sozinha, igual o resto do app.
const prisma = new PrismaClient();

const DEMO_USERS = [
  { email: "demo1@animehub.local", displayName: "Marina Sakurai" },
  { email: "demo2@animehub.local", displayName: "Kenji Oliveira" },
  { email: "demo3@animehub.local", displayName: "Yuki_BR" },
  { email: "demo4@animehub.local", displayName: "Bia Otaku" },
  { email: "demo5@animehub.local", displayName: "Rafa Shounen" },
  { email: "demo6@animehub.local", displayName: "Larissa Mangaka" },
  { email: "demo7@animehub.local", displayName: "Thiago Isekai" },
  { email: "demo8@animehub.local", displayName: "Camila Seiyuu" },
  { email: "demo9@animehub.local", displayName: "Diego Kaiju" },
  { email: "demo10@animehub.local", displayName: "Nat Cosplay" },
];

const POST_TEMPLATES = [
  (t) => `Maratonando ${t} esse fim de semana, não consigo parar 😭`,
  (t) => `Alguém mais chorou com o último episódio de ${t}? Não tô bem.`,
  (t) => `A trilha sonora de ${t} é subestimada demais, precisa falar mais disso.`,
  (t) => `Recomendo demais ${t} pra quem gosta de um ritmo mais lento no começo.`,
  (t) => `Reassistindo ${t} e reparando em detalhes que passei batido da 1ª vez.`,
  (t) => `${t} tava na minha lista há meses e finalmente comecei. Por que demorei tanto.`,
  (t) => `A animação de ${t} melhora muito a partir do arco atual, vale insistir.`,
  (t) => `Debate sério: ${t} tem o melhor elenco de vilões da temporada?`,
  (t) => `Terminei ${t} ontem e ainda tô processando o final.`,
  (t) => `Alguém sabe se ${t} vai ter 2ª temporada confirmada?`,
  (t) => `${t} é underrated, deveria ter muito mais gente falando disso por aqui.`,
  (t) => `Voltei pra rever ${t} do zero antes da temporada nova sair.`,
];

const COMMENT_TEMPLATES = [
  "Esse episódio foi surreal, não esperava essa virada.",
  "A dublagem em português ficou muito boa nesse arco.",
  "Alguém mais achou o ritmo meio arrastado no meio?",
  "Esse é fácil top 3 da temporada pra mim.",
  "Voltei só pra comentar que o OP novo é incrível.",
  "Curioso pra ver como isso vai terminar no mangá.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

// Datas espalhadas nos últimos 21 dias — feed com "3h atrás"/"5d atrás"
// variados em vez de tudo cravado no mesmo segundo (achado ao criar isto:
// sem isso o Feed inteiro mostrava só "agora" pra tudo, nada orgânico).
function randomPastDate(maxDaysAgo) {
  const ms = Math.random() * maxDaysAgo * 24 * 3600 * 1000;
  return new Date(Date.now() - ms);
}

async function main() {
  const demoEmails = DEMO_USERS.map((u) => u.email);
  console.log("Limpando dados de demo anteriores (se houver)...");
  await prisma.user.deleteMany({ where: { email: { in: demoEmails } } });

  const catalogPool = await prisma.catalogEntry.findMany({
    where: { anilistId: { not: null } },
    take: 60,
  });
  if (catalogPool.length < 10) {
    throw new Error(
      `Catálogo local só tem ${catalogPool.length} animes com anilistId — rode "npm run seed:catalog" primeiro.`
    );
  }
  console.log(`Catálogo disponível: ${catalogPool.length} animes.`);

  const realUser = await prisma.user.findFirst({
    where: { email: { notIn: demoEmails } },
    orderBy: { createdAt: "asc" },
  });

  console.log("Criando 10 contas...");
  const users = [];
  for (const u of DEMO_USERS) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        // Mesmo padrão de tests/global-setup.ts — conta sintética, nunca
        // logada de verdade via senha real, só existe pra povoar dado.
        passwordHash: "seed-fixture-not-a-real-hash",
        passwordSalt: "seed-fixture-not-a-real-salt",
        displayName: u.displayName,
      },
    });
    users.push(user);
  }

  console.log("Cada conta favorita/assiste 2-4 animes do catálogo local...");
  // userAnimeByUser[userId] = linhas de Anime criadas pra esse usuário —
  // usado depois pra escolher sobre o que postar/comentar.
  const userAnimeByUser = new Map();
  for (const user of users) {
    const picks = pickN(catalogPool, 2 + Math.floor(Math.random() * 3));
    const rows = [];
    for (const entry of picks) {
      const isFavorite = Math.random() < 0.5;
      const anime = await prisma.anime.create({
        data: {
          userId: user.id,
          anilistId: entry.anilistId,
          titleRomaji: entry.titleRomaji,
          titleEnglish: entry.titleEnglish,
          coverImage: entry.coverImage,
          bannerImage: entry.bannerImage,
          description: entry.description,
          episodes: entry.episodes,
          genres: entry.genres,
          status: entry.status,
          season: entry.season,
          seasonYear: entry.seasonYear,
          isFavorite,
          favoritedAt: isFavorite ? randomPastDate(30) : null,
        },
      });
      if (Math.random() < 0.7) {
        const episodeProgress = anime.episodes
          ? Math.floor(Math.random() * anime.episodes)
          : Math.floor(Math.random() * 12);
        await prisma.watchProgress.create({
          data: {
            animeId: anime.id,
            status: pick(["WATCHING", "COMPLETED", "PLAN_TO_WATCH"]),
            episodeProgress,
            // `score` é 0-10 (cada estrela do widget de 5 estrelas vale 2
            // pontos) — a fórmula original gerava 10-20 por confundir a
            // escala de estrelas (0-5) com a de score (0-10), resultando em
            // notas "14/10"/"20/10" ao lado de 5 estrelas cheias na tela
            // (achado real da 24ª rodada de auditoria, Epic 18). 3-5
            // estrelas (nota tendendo positiva, mais orgânico) = score 6/8/10.
            score: Math.random() < 0.6 ? 2 * (3 + Math.floor(Math.random() * 3)) : null,
          },
        });
      }
      rows.push(anime);
    }
    userAnimeByUser.set(user.id, rows);
  }

  console.log("Criando posts...");
  const allPosts = [];
  for (const user of users) {
    const animeRows = userAnimeByUser.get(user.id);
    const postCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < postCount; i++) {
      const anime = pick(animeRows);
      const body = pick(POST_TEMPLATES)(anime.titleRomaji);
      const attachImage = Math.random() < 0.3 && anime.coverImage;
      const post = await prisma.post.create({
        data: {
          userId: user.id,
          anilistId: anime.anilistId,
          animeTitleRomaji: anime.titleRomaji,
          animeTitleEnglish: anime.titleEnglish,
          animeCoverImage: anime.coverImage,
          body,
          imageUrls: attachImage ? [anime.coverImage] : [],
          createdAt: randomPastDate(21),
        },
      });
      allPosts.push(post);
    }
  }
  console.log(`  ${allPosts.length} posts criados.`);

  console.log("Curtindo posts uns dos outros...");
  let likeCount = 0;
  for (const post of allPosts) {
    const likers = pickN(
      users.filter((u) => u.id !== post.userId),
      Math.floor(Math.random() * 5)
    );
    for (const liker of likers) {
      await prisma.postLike.create({ data: { postId: post.id, userId: liker.id } });
      likeCount++;
    }
  }
  console.log(`  ${likeCount} curtidas criadas.`);

  console.log("Comentando em animes populares (threads compartilhadas)...");
  // Pega os animes mais escolhidos por mais de 1 usuário — vira "thread"
  // de verdade na lateral do Feed em vez de 1 comentário solto por anime.
  const anilistIdCounts = new Map();
  for (const rows of userAnimeByUser.values()) {
    for (const a of rows) anilistIdCounts.set(a.anilistId, (anilistIdCounts.get(a.anilistId) ?? 0) + 1);
  }
  const popularAnilistIds = Array.from(anilistIdCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([id]) => id);

  let commentCount = 0;
  for (const anilistId of popularAnilistIds) {
    const eligibleUsers = users.filter((u) =>
      userAnimeByUser.get(u.id).some((a) => a.anilistId === anilistId)
    );
    const commenters = pickN(eligibleUsers, 2 + Math.floor(Math.random() * Math.min(3, eligibleUsers.length)));
    for (const user of commenters) {
      await prisma.comment.create({
        data: {
          anilistId,
          userId: user.id,
          body: pick(COMMENT_TEMPLATES),
          createdAt: randomPastDate(14),
        },
      });
      commentCount++;
    }
  }
  console.log(`  ${commentCount} comentários criados em ${popularAnilistIds.length} threads.`);

  console.log("Criando follows entre as contas (e com a conta real, se houver)...");
  let followCount = 0;
  for (const user of users) {
    const targets = pickN(
      users.filter((u) => u.id !== user.id),
      2 + Math.floor(Math.random() * 3)
    );
    for (const target of targets) {
      await prisma.follow.upsert({
        where: { followerId_followingId: { followerId: user.id, followingId: target.id } },
        create: { followerId: user.id, followingId: target.id },
        update: {},
      });
      followCount++;
    }
  }
  if (realUser) {
    // A conta real segue todo mundo (pra ver o Feed "Seguindo" povoado de
    // verdade) e metade das contas de demo segue de volta.
    for (const user of users) {
      await prisma.follow.upsert({
        where: { followerId_followingId: { followerId: realUser.id, followingId: user.id } },
        create: { followerId: realUser.id, followingId: user.id },
        update: {},
      });
      followCount++;
      if (Math.random() < 0.5) {
        await prisma.follow.upsert({
          where: { followerId_followingId: { followerId: user.id, followingId: realUser.id } },
          create: { followerId: user.id, followingId: realUser.id },
          update: {},
        });
        followCount++;
      }
    }
  }
  console.log(`  ${followCount} relações de follow criadas.`);

  console.log("\nPronto:");
  console.log(`  ${users.length} contas`);
  console.log(`  ${allPosts.length} posts`);
  console.log(`  ${likeCount} curtidas`);
  console.log(`  ${commentCount} comentários`);
  console.log(`  ${followCount} follows`);
  if (realUser) {
    console.log(`  conta real (${realUser.displayName}) agora segue as 10 contas de demo`);
  } else {
    console.log("  nenhuma conta real encontrada — só as contas de demo foram criadas");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

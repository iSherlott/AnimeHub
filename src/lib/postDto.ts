import type { Post } from "@prisma/client";
import { maskSpoilers } from "@/lib/spoilers";
import { parseTierSnapshot, stripTierLines, type TierSnapshot } from "@/lib/tierListTypes";
import type { PostPollDTO } from "@/lib/postPollTypes";

/**
 * Pré-visualização só-leitura de um post citado (Epic 25) — nunca mais
 * de 1 nível (citar uma citação embute só a mais recente, mesmo limite
 * visual do Twitter). Sem link: este app não tem página de post avulso.
 */
export type PostSummaryDTO = {
  id: string;
  author: { id: string; displayName: string; handle: string | null; avatarUrl: string | null };
  /** Vazio quando `isSpoiler` — o texto só sai pela rota de revelar. */
  body: string;
  isSpoiler: boolean;
  imageUrl: string | null;
  /** Descrição da imagem (texto alternativo), "" sem descrição. */
  imageAlt: string;
  /** null = publicação sem obra associada (contexto opcional). */
  animeTitleRomaji: string | null;
  animeTitleEnglish: string | null;
  createdAt: string;
};

export type PostDTO = {
  id: string;
  /** Vazio (e sem imagens) quando `isSpoiler` — ver /api/posts/[postId]/reveal. */
  body: string;
  isSpoiler: boolean;
  imageUrls: string[];
  /** Descrição de cada imagem (texto alternativo), na mesma ordem; "" = sem descrição. Vazia com spoiler, como as imagens. */
  imageAlts: string[];
  /** Imagem marcada como spoiler (borrada até tocar), na mesma ordem. Vazia com spoiler, como as imagens. */
  imageSpoilers: boolean[];
  /** Até onde vai o spoiler ("até o episódio 18"); só com `isSpoiler`. */
  spoilerEpisode: number | null;
  /** Era spoiler até este episódio, e ele estreou há mais de 7 dias: o conteúdo já vem aberto (ver spoilerRelease.ts). */
  releasedSpoilerEpisode: number | null;
  /** Tier list publicada: o card desenha o quadro (e o texto vem sem as linhas "S: …", que o quadro já mostra). */
  tierList: TierSnapshot | null;
  /** Idioma do texto original ("ja"/"en" nas notícias do NewsHub); null = escrito na plataforma, em português. */
  bodyLang: string | null;
  /** O texto em outros idiomas (notícias do NewsHub): o card abre em português e um botão troca para inglês ou japonês. */
  translations: { lang: string; body: string }[];
  /** Proporção (largura/altura) medida de cada imagem, na mesma ordem; null = ainda não medida. O quadro se ajusta a ela. */
  imageRatios: (number | null)[];
  /** Enquete da publicação (12/11/2026), ou null. */
  poll: PostPollDTO | null;
  createdAt: string;
  /** null = publicação sem obra associada (Figma 13:41840: contexto opcional). */
  anilistId: number | null;
  /** Chave da página da obra (`/anime/<workKey>`): o AniList ID ou, sem ele, `anidb-<id>`/`kitsu-<id>`. */
  workKey: string | null;
  animeTitleRomaji: string | null;
  animeTitleEnglish: string | null;
  /** Título original e formato (TV, filme…) da produção canônica, quando conhecida. */
  animeTitleNative: string | null;
  animeFormat: string | null;
  animeCoverImage: string | null;
  author: { id: string; displayName: string; handle: string | null; avatarUrl: string | null; /** Título equipado ("Olhar de boticária"), se houver. */ title?: string | null };
  isMine: boolean;
  likeCount: number;
  likedByMe: boolean;
  reportedByMe: boolean;
  commentCount: number;
  quotedPost: PostSummaryDTO | null;
  /// A citação aponta para um post que não pode ser mostrado (apagado,
  /// removido por moderação ou de alguém bloqueado) — a UI mostra o
  /// tombstone neutro "Publicação original indisponível" (Figma 13:43571),
  /// sem texto, autor ou motivo.
  quotedUnavailable: boolean;
  /// Quem repostou (Epic 25) — presente só quando esta linha do feed
  /// veio de uma linha-repost resolvida pro original; o próprio PostDTO
  /// sempre descreve o ORIGINAL (curtida/comentário/citação agem sobre
  /// `id` acima, nunca sobre a linha de repost em si).
  repostedBy: { id: string; displayName: string } | null;
  repostedByMe: boolean;
  /** Anime deste post está nos favoritos do viewer (Epic 27, lote 3) —
   * puramente informativo (não muda quais posts aparecem em nenhuma aba),
   * usado só pra destacar visualmente o chip do anime no card. */
  favoritedByMe: boolean;
  /** A obra do post está no catálogo e, portanto, tem comunidade (atalho "Comunidade" no card). */
  hasCommunity: boolean;
};

type PostWithAuthor = Post & { user: { id: string; displayName: string; handle?: string | null; avatarUrl: string | null }; catalogEntry?: { anidbId: number | null; kitsuId: number | null } | null };

/** Chave da página da obra do post (AniList ID ou, para obra sem ele, a do catálogo). */
function postWorkKey(post: PostWithAuthor): string | null {
  if (post.anilistId !== null) return String(post.anilistId);
  const entry = post.catalogEntry;
  if (!entry) return null;
  return entry.kitsuId ? `kitsu-${entry.kitsuId}` : entry.anidbId ? `anidb-${entry.anidbId}` : null;
}

export function toPostSummaryDto(post: PostWithAuthor): PostSummaryDTO {
  return {
    id: post.id,
    author: { id: post.user.id, displayName: post.user.displayName, handle: post.user.handle ?? null, avatarUrl: post.user.avatarUrl },
    body: post.isSpoiler ? "" : maskSpoilers(post.body),
    isSpoiler: post.isSpoiler,
    imageUrl: post.isSpoiler || post.imageSpoilers?.[0] ? null : (post.imageUrls[0] ?? null),
    imageAlt: post.isSpoiler ? "" : (post.imageAlts?.[0] ?? ""),
    animeTitleRomaji: post.animeTitleRomaji,
    animeTitleEnglish: post.animeTitleEnglish,
    createdAt: post.createdAt.toISOString(),
  };
}

/**
 * Curtidas/denúncias não são colunas no Post — são contadas/consultadas à
 * parte (em lote, pra evitar N+1) por quem chama isto. `viewerId` é
 * opcional porque leituras públicas (perfil de outro usuário) não exigem
 * sessão — nesse caso isMine/likedByMe/reportedByMe vêm sempre false.
 * `post` aqui é sempre o ORIGINAL — uma linha-repost resolve pro
 * original antes de chegar aqui (ver src/app/api/posts/route.ts).
 */
export function toPostDto(
  post: PostWithAuthor,
  opts: {
    viewerId: string | null;
    likeCount: number;
    likedByMe: boolean;
    reportedByMe: boolean;
    commentCount: number;
    quotedPost?: PostWithAuthor | null;
    repostedBy?: { id: string; displayName: string } | null;
    repostedByMe?: boolean;
    favoritedByMe?: boolean;
    hasCommunity?: boolean;
    production?: { titleNative: string | null; format: string | null } | null;
    authorTitle?: string | null;
    /** O episódio do spoiler estreou há mais de 7 dias: vai aberto, com a marca de que era spoiler. */
    spoilerReleased?: boolean;
    translations?: { lang: string; body: string }[];
    /** Tamanho medido das imagens (ImageSize), por endereço. */
    imageSizes?: Map<string, { width: number; height: number }>;
    poll?: PostPollDTO | null;
  }
): PostDTO {
  const released = Boolean(opts.spoilerReleased && post.isSpoiler && post.spoilerEpisode);
  const hidden = post.isSpoiler && !released;
  const tierList = hidden ? null : parseTierSnapshot(post.tierListJson);
  return {
    id: post.id,
    body: hidden ? "" : tierList ? stripTierLines(post.body) : post.body,
    isSpoiler: hidden,
    imageUrls: hidden ? [] : post.imageUrls,
    imageAlts: hidden ? [] : post.imageUrls.map((_, i) => post.imageAlts?.[i] ?? ""),
    imageSpoilers: hidden ? [] : post.imageUrls.map((_, i) => (released ? false : (post.imageSpoilers?.[i] ?? false))),
    spoilerEpisode: hidden ? (post.spoilerEpisode ?? null) : null,
    releasedSpoilerEpisode: released ? (post.spoilerEpisode ?? null) : null,
    tierList,
    bodyLang: post.bodyLang ?? null,
    poll: hidden ? null : (opts.poll ?? null),
    translations: hidden ? [] : (opts.translations ?? []),
    imageRatios: hidden ? [] : post.imageUrls.map((u) => {
      const size = opts.imageSizes?.get(u);
      return size && size.height > 0 ? size.width / size.height : null;
    }),
    createdAt: post.createdAt.toISOString(),
    anilistId: post.anilistId,
    workKey: postWorkKey(post),
    animeTitleRomaji: post.animeTitleRomaji,
    animeTitleEnglish: post.animeTitleEnglish,
    animeTitleNative: opts.production?.titleNative ?? null,
    animeFormat: opts.production?.format ?? null,
    animeCoverImage: post.animeCoverImage,
    author: { id: post.user.id, displayName: post.user.displayName, handle: post.user.handle ?? null, avatarUrl: post.user.avatarUrl, title: opts.authorTitle ?? null },
    isMine: post.user.id === opts.viewerId,
    likeCount: opts.likeCount,
    likedByMe: opts.likedByMe,
    reportedByMe: opts.reportedByMe,
    commentCount: opts.commentCount,
    // `deletedAt` checado aqui, não só na criação — na criação já é
    // impossível citar um post já apagado (POST valida isso), mas o post
    // citado pode ser apagado DEPOIS, por qualquer leitura futura desta
    // citação. Sem esse filtro, o conteúdo de um post apagado (corpo,
    // autor, anime) continuava circulando pra sempre dentro de toda
    // citação dele — um gap real de integridade/moderação (achado da 18ª
    // rodada de auditoria, Epic 18): apagar um post por denúncia, por
    // exemplo, não impedia o texto de continuar visível embutido em quem
    // o citou. Mesmo padrão já usado por resolveRepostRows pro repost.
    quotedPost: opts.quotedPost && !opts.quotedPost.deletedAt ? toPostSummaryDto(opts.quotedPost) : null,
    quotedUnavailable: Boolean(post.quotedPostId) && !(opts.quotedPost && !opts.quotedPost.deletedAt),
    repostedBy: opts.repostedBy ?? null,
    repostedByMe: opts.repostedByMe ?? false,
    favoritedByMe: opts.favoritedByMe ?? false,
    hasCommunity: opts.hasCommunity ?? false,
  };
}

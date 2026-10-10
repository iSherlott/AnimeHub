import type { PostDTO } from "@/lib/postDto";

/**
 * Destino do editor "Nova publicação" (`/publicar`, Figma `13:41840`). O
 * editor aceita, via URL, uma citação (post de origem) e/ou uma obra já
 * escolhida ("Publicar sobre este anime").
 */
export function publishHref(opts: { quote?: { id: string; author: string; snippet: string }; anilistId?: number } = {}): string {
  const params = new URLSearchParams();
  if (opts.quote) {
    params.set("quotePostId", opts.quote.id);
    params.set("quoteAuthor", opts.quote.author);
    params.set("quoteSnippet", opts.quote.snippet);
  }
  if (opts.anilistId) params.set("anilistId", String(opts.anilistId));
  const qs = params.toString();
  return qs ? `/publicar?${qs}` : "/publicar";
}

/** "Citar publicação": abre o editor já referenciando o post (sem texto de spoiler). */
export function quoteHref(post: PostDTO): string {
  return publishHref({
    quote: {
      id: post.id,
      author: post.author.displayName,
      // Publicação com spoiler nunca expõe o texto nem num trecho de URL.
      snippet: post.isSpoiler ? "" : post.body.slice(0, 80),
    },
  });
}

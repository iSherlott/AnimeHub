"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { SpoilerGate } from "@/components/SpoilerGate";
import { PostBodyText } from "@/components/PostBodyText";
import { splitTrailingHashtags } from "@/lib/hashtags";
import { spoilerLabel } from "@/lib/spoilers";
import type { PostDTO } from "@/lib/postDto";

/**
 * A publicação citada dentro de outra ("Referência interna", Figma 13:41325): autor, miniatura, o começo do texto (ou o
 * spoiler fechado) e o link para a original; ou o aviso neutro quando a original não pode ser mostrada.
 */
export function PostQuote({ post }: { post: PostDTO }) {
  const [quotedCoverBroken, setQuotedCoverBroken] = useState(false);
  return (
    <>
      {post.quotedUnavailable && !post.quotedPost && (
        <Box
          data-testid="quoted-unavailable"
          sx={{ p: 2, bgcolor: "background.paper", borderRadius: "10px", color: "text.secondary", display: "flex", flexDirection: "column", gap: 1 }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: 12 }}>↗ Publicação original indisponível</Typography>
          <Typography sx={{ fontSize: 14 }}>
            Conteúdo removido ou não acessível. Nenhum trecho ou texto do autor original é exibido.
          </Typography>
        </Box>
      )}

      {post.quotedPost && (
        <Box sx={{ p: 2, bgcolor: "background.paper", borderRadius: "10px", display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 12, color: "text.secondary" }}>
            ↗ Publicação de{" "}
            <MuiLink component={NextLink} href={`/users/${post.quotedPost.author.id}`} underline="hover" color="inherit">
              {post.quotedPost.author.displayName}
            </MuiLink>
            {post.quotedPost.author.handle ? ` · @${post.quotedPost.author.handle}` : ""}
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            {post.quotedPost.imageUrl && !quotedCoverBroken && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.quotedPost.imageUrl}
                alt={post.quotedPost.imageAlt ?? ""}
                onError={() => setQuotedCoverBroken(true)}
                style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
              />
            )}
            <Box sx={{ minWidth: 0 }}>
              {post.quotedPost.isSpoiler ? (
                <SpoilerGate<{ body: string }>
                  revealUrl={`/api/posts/${post.quotedPost.id}/reveal`}
                  label={spoilerLabel({ work: post.quotedPost.animeTitleEnglish ?? post.quotedPost.animeTitleRomaji })}
                  render={(d) => (
                    <Typography sx={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                      <PostBodyText text={d.body} spoilerLabel={spoilerLabel({ work: post.quotedPost?.animeTitleEnglish ?? post.quotedPost?.animeTitleRomaji })} />
                    </Typography>
                  )}
                />
              ) : (
                <Typography
                  sx={{ fontSize: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                >
                  {splitTrailingHashtags(post.quotedPost.body).body}
                </Typography>
              )}
              <MuiLink component={NextLink} href={`/publicacao/${post.quotedPost.id}`} underline="hover" sx={{ fontSize: 14, color: "text.primary" }}>
                Abrir publicação original
              </MuiLink>
            </Box>
          </Stack>
        </Box>
      )}
    </>
  );
}

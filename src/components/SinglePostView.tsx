"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Typography } from "@mui/material";
import { PostCard } from "@/components/PostCard";
import { PageIntro, TwoColumn } from "@/components/PageShell";
import { quoteHref } from "@/lib/publishLinks";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { PostDTO } from "@/lib/postDto";

/**
 * Página dedicada de discussão (Figma `13:42257`): a publicação inteira com
 * as respostas já abertas e a lateral "Anime da conversa" (`aside`, montada
 * no servidor). Voltar usa o histórico do navegador, que restaura a origem.
 * Erro mantém a origem e oferece "Tentar novamente" sem inventar conteúdo
 * (`13:43963`).
 */
export function SinglePostView({ postId, aside }: { postId: string; aside?: ReactNode }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [post, setPost] = useState<PostDTO | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("loading");
    fetch(`/api/posts/${postId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setState("missing");
        if (!res.ok) throw new Error("falha");
        const data = await res.json();
        setPost(data.post);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [postId, reloadKey]);

  const patch = useCallback((fields: Partial<PostDTO>) => setPost((p) => (p ? { ...p, ...fields } : p)), []);

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  const main = (
    <Box>
      {state === "loading" && (
        <Typography sx={{ color: "text.secondary", fontSize: 14 }} aria-busy="true">
          Carregando discussão…
        </Typography>
      )}
      {state === "error" && (
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </Button>
          }
        >
          Não foi possível abrir a discussão. A origem foi mantida.
        </Alert>
      )}
      {state === "missing" && (
        <Box data-testid="post-unavailable" sx={{ py: 4, display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography component="h2" sx={{ fontSize: 20 }}>
            Publicação removida
          </Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 14, mb: 2 }}>Esta conversa não está mais disponível.</Typography>
          <Box>
            <Button component={NextLink} href="/" variant="outlined">
              Voltar ao Feed
            </Button>
          </Box>
        </Box>
      )}
      {state === "ready" && post && (
        <PostCard
          post={post}
          initialCommentsOpen
          commentsHeading
          onDeleted={() => router.push("/")}
          onQuote={(p) => {
            if (!user) return;
            router.push(quoteHref(p));
          }}
          onCommentCountChange={(_, count) => patch({ commentCount: count })}
          onRepostChange={(_, reposted) => patch({ repostedByMe: reposted })}
          onLikeChange={(_, liked, likeCount) => patch({ likedByMe: liked, likeCount })}
          onReportChange={(_, reported) => patch({ reportedByMe: reported })}
        />
      )}
    </Box>
  );

  return (
    <>
      <PageIntro kicker="会話 / COMUNIDADE" title="Discussão" subtitle="Uma conversa por inteiro, com a obra sempre em contexto." />
      <Button onClick={goBack} sx={{ alignSelf: "flex-start", px: 0, color: "text.secondary", fontWeight: 400 }}>
        ← Voltar ao Feed / Para você
      </Button>
      <TwoColumn main={main} aside={aside} />
    </>
  );
}

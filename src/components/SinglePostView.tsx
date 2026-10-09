"use client";

import { useCallback, useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Alert, Box, Button, Typography } from "@mui/material";
import { PostCard } from "@/components/PostCard";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { PostDTO } from "@/lib/postDto";

/**
 * Página dedicada de discussão (Figma `13:42257`): a publicação inteira com
 * as respostas já abertas. Voltar usa o histórico do navegador, que restaura
 * a origem. Erro mantém a origem e oferece "Tentar novamente" sem inventar
 * conteúdo (`13:43963`).
 */
export function SinglePostView({ postId }: { postId: string }) {
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

  return (
    <Box>
      <Button onClick={goBack} startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2 }}>
        Voltar
      </Button>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        Discussão
      </Typography>

      {state === "loading" && (
        <Typography variant="body2" sx={{ color: "text.secondary" }} aria-busy="true">
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
        <Box data-testid="post-unavailable" sx={{ py: 4 }}>
          <Typography variant="h6" component="h2">
            Publicação removida
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Esta conversa não está mais disponível.
          </Typography>
          <Button component={NextLink} href="/" variant="outlined" size="small">
            Voltar à Comunidade
          </Button>
        </Box>
      )}
      {state === "ready" && post && (
        <PostCard
          post={post}
          initialCommentsOpen
          onDeleted={() => router.push("/")}
          onQuote={(p) => {
            if (!user) return;
            const params = new URLSearchParams({
              quotePostId: p.id,
              quoteAuthor: p.author.displayName,
              quoteSnippet: p.body.slice(0, 80),
            });
            router.push(`/?${params.toString()}`);
          }}
          onCommentCountChange={(_, count) => patch({ commentCount: count })}
          onRepostChange={(_, reposted) => patch({ repostedByMe: reposted })}
          onLikeChange={(_, liked, likeCount) => patch({ likedByMe: liked, likeCount })}
          onReportChange={(_, reported) => patch({ reportedByMe: reported })}
        />
      )}
    </Box>
  );
}

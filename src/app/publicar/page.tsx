import { redirect } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { Header } from "@/components/Header";
import { PostComposer } from "@/components/PostComposer";
import { PageContainer, PageIntro, TwoColumn, SectionTitle } from "@/components/PageShell";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { prisma } from "@/lib/prisma";
import { resolveWorkKey } from "@/lib/workRef";

type Props = { searchParams: Promise<{ quotePostId?: string; quoteAuthor?: string; quoteSnippet?: string; anilistId?: string; obra?: string }> };

/**
 * Nova publicação (Figma "14 — Criar publicação" `13:41840` e "Criar via
 * anime" `13:41925`). Exige conta: sem sessão, vai ao login e volta para
 * este editor com o destino (e o rascunho, em sessionStorage) preservados.
 */
export default async function PublishPage({ searchParams }: Props) {
  const q = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    const keep = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (typeof v === "string") keep.set(k, v);
    redirect(loginHref(`/publicar${keep.size ? `?${keep.toString()}` : ""}`));
  }

  // Obra pré-selecionada ("Publicar sobre este anime"): só se a produção existir.
  const anilistId = q.anilistId && /^\d+$/.test(q.anilistId) ? Number(q.anilistId) : null;
  const production = anilistId ? await prisma.production.findUnique({ where: { anilistId }, include: { franchise: { select: { name: true } } } }) : null;
  // Obra sem AniList ID (só do AniDB/Kitsu): `obra=anidb-<id>`.
  const catalogWork = !production && q.obra ? await resolveWorkKey(q.obra) : null;
  const initialAnime = production
    ? {
        anilistId: production.anilistId,
        work: String(production.anilistId),
        title: production.titleEnglish || production.titleRomaji,
        native: production.titleNative,
        english: production.titleEnglish,
        fromDetail: true,
        meta: [
          `Temporada ${production.seasonNumber}`,
          production.format,
          production.seasonYear ? String(production.seasonYear) : null,
          `Franquia ${production.franchise.name}`,
        ]
          .filter(Boolean)
          .join(" · "),
      }
    : catalogWork
      ? { anilistId: catalogWork.anilistId, work: catalogWork.key, title: catalogWork.titleEnglish || catalogWork.titleRomaji, native: catalogWork.titleNative, english: catalogWork.titleEnglish, fromDetail: true, meta: null }
    : null;

  const quote = q.quotePostId
    ? { id: q.quotePostId, author: (q.quoteAuthor ?? "").slice(0, 60), snippet: (q.quoteSnippet ?? "").slice(0, 80) }
    : null;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro
          kicker="会話 / COMUNIDADE"
          title="Nova publicação"
          subtitle={
            initialAnime
              ? "Uma nova conversa, com a produção certa em contexto."
              : "Compartilhe uma impressão, uma pergunta ou uma recomendação."
          }
        />
        <AppLink
          href={initialAnime ? `/anime/${initialAnime.work}#discussoes` : "/"}
          underline="hover"
          sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}
        >
          {initialAnime ? `← Voltar a ${initialAnime.native ?? initialAnime.title} / Discussões` : "← Voltar ao Feed / Para você"}
        </AppLink>
        <TwoColumn
          main={<PostComposer initialAnime={initialAnime} quote={quote} />}
          aside={
            <>
              <Box sx={{ bgcolor: "background.paper", borderRadius: "16px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
                <SectionTitle>Antes de compartilhar</SectionTitle>
                <Typography sx={{ fontSize: 14 }}>Publicação pública. Sua Minha Lista continua privada e não será anexada.</Typography>
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                  Só texto. Não dá para editar depois de publicar, mas você pode excluir a sua publicação.
                </Typography>
              </Box>
            </>
          }
        />
      </PageContainer>
    </Box>
  );
}

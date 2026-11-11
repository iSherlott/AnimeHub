import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box, Chip, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { CoverImage } from "@/components/CoverImage";
import { Header } from "@/components/Header";
import { ComingSoonSeen } from "@/components/ComingSoonSeen";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { prisma } from "@/lib/prisma";
import { comingSoonFor, type ComingSoonItem } from "@/lib/comingSoon";
import { FORMAT_LABEL, SEASON_LABEL } from "@/lib/workLabels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Em breve · Anime Hub" };

const DAY = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

/** "12 de jan. de 2027" sem o ponto da abreviação: "12 de jan de 2027". */
function day(iso: string): string {
  return DAY.format(new Date(iso)).replace(".", "");
}

function when(item: ComingSoonItem): string {
  if (item.status === "RELEASING") return item.startDate ? `Estreou em ${day(item.startDate)}` : "Já começou a passar";
  if (item.startDate) return `Estreia em ${day(item.startDate)}`;
  if (item.season && item.seasonYear) return `Previsto para ${SEASON_LABEL[item.season] ?? item.season} ${item.seasonYear}`;
  if (item.seasonYear) return `Previsto para ${item.seasonYear}`;
  return "Data de estreia ainda não anunciada";
}

function Card({ item }: { item: ComingSoonItem }) {
  const format = item.format ? (FORMAT_LABEL[item.format] ?? item.format) : null;
  return (
    <Box
      component="li"
      id={`obra-${item.key}`}
      data-testid="coming-soon-item"
      sx={{
        display: "flex",
        gap: 2,
        p: 1.5,
        borderRadius: "12px",
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        scrollMarginTop: 96,
        // Quem chega pelo aviso do sino (#obra-…) vê a obra destacada.
        // (sem função no sx: a página é Server Component e função não atravessa para o cliente)
        "&:target": { borderColor: "primary.main", bgcolor: "action.selected" },
      }}
    >
      <AppLink href={`/anime/${item.key}`} aria-hidden tabIndex={-1} sx={{ position: "relative", width: { xs: 76, sm: 92 }, flexShrink: 0, aspectRatio: "2 / 3", borderRadius: "8px", overflow: "hidden", bgcolor: "#171820", alignSelf: "flex-start" }}>
        {item.coverImage && <CoverImage src={item.coverImage} sizes="92px" />}
      </AppLink>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.75 }}>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          <Chip size="small" label={item.status === "RELEASING" ? "No ar" : "Anunciado"} color={item.status === "RELEASING" ? "secondary" : "primary"} sx={{ fontWeight: 700 }} />
          {format && <Chip size="small" variant="outlined" label={format} />}
          {item.inList && <Chip size="small" variant="outlined" label="Na sua lista" data-testid="coming-soon-in-list" />}
        </Box>
        <AppLink href={`/anime/${item.key}`} underline="hover" sx={{ color: "text.primary", fontSize: 16, fontWeight: 700, lineHeight: 1.3, overflowWrap: "anywhere" }} data-testid="coming-soon-title">
          {item.title}
        </AppLink>
        <Typography sx={{ fontSize: 13, color: "text.secondary", overflowWrap: "anywhere" }} data-testid="coming-soon-related">
          {item.relation === "PREQUEL" ? "Continuação de " : "Filme ou especial de "}
          <AppLink href={`/anime/${item.relatedKey}`} underline="hover" sx={{ color: "text.primary" }}>
            {item.relatedTitle}
          </AppLink>
        </Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }} data-testid="coming-soon-when">
          {when(item)}
        </Typography>
      </Box>
    </Box>
  );
}

function Section({ title, hint, items, testId }: { title: string; hint: string; items: ComingSoonItem[]; testId: string }) {
  if (items.length === 0) return null;
  return (
    <Box component="section" data-testid={testId} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box>
        <Typography component="h2" sx={{ fontSize: 20, fontWeight: 700 }}>
          {title} · {items.length}
        </Typography>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{hint}</Typography>
      </Box>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" }, gap: 1.5 }}>
        {items.map((item) => (
          <Card key={item.key} item={item} />
        ))}
      </Box>
    </Box>
  );
}

/**
 * "Em breve" (12/11/2026): continuações, filmes e especiais das obras que a pessoa assistiu ou favoritou, anunciados ou
 * que acabaram de estrear. Só se chega pelo sino (Lançamentos → Em breve); abrir a página marca os anúncios como lidos.
 * Regra em src/lib/comingSoon.ts.
 */
export default async function ComingSoonPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/em-breve"));
  const now = new Date();
  const [items] = await Promise.all([
    comingSoonFor(user.id, now),
    prisma.socialNotification.updateMany({ where: { userId: user.id, type: "WORK_ANNOUNCED", readAt: null }, data: { readAt: now } }),
  ]);
  const airing = items.filter((i) => i.status === "RELEASING");
  const announced = items.filter((i) => i.status === "NOT_YET_RELEASED");
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <ComingSoonSeen at={now.toISOString()} />
        <PageIntro kicker="近日公開 / EM BREVE" title="Em breve" subtitle="Continuações, filmes e especiais das obras que você assistiu ou marcou como favoritas." />
        {items.length === 0 ? (
          <Box data-testid="coming-soon-empty" sx={{ display: "flex", flexDirection: "column", gap: 1, py: 2 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 700 }}>Nada anunciado por enquanto.</Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary", maxWidth: "60ch" }}>
              Quando uma obra que você assistiu ou favoritou ganhar continuação, filme ou especial, ela aparece aqui e o sino avisa.
            </Typography>
          </Box>
        ) : (
          <>
            <Section title="Já estreou" hint="Começou a passar nos últimos dois meses." items={airing} testId="coming-soon-airing" />
            <Section title="Anunciado" hint="Da estreia mais próxima para a mais distante." items={announced} testId="coming-soon-announced" />
          </>
        )}
      </PageContainer>
    </Box>
  );
}

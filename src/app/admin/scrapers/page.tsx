import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip, adminPanelSx } from "@/components/admin/AdminUi";
import { RunEpisodeImagesButton } from "@/components/admin/RunEpisodeImagesButton";
import { RunNewsButton } from "@/components/admin/RunNewsButton";
import { Notice } from "@/components/StatePanels";
import { isRunning } from "@/lib/episodeImages";
import { isNewsRunning } from "@/lib/animeNews";
import { PARSER_VERSION } from "@/lib/adminImport/parseSeasonHtml";
import { fmtClock, fmtDayClock, requireAdminPage } from "@/lib/adminPage";

export const dynamic = "force-dynamic";

type Exec = { key: string; service: string; at: Date; ok: boolean; result: string; context: string };

/**
 * Admin → Scrapers (Figma `8:4597`): serviços de dados independentes e a
 * observabilidade de origem. A coleta automática de sites de terceiros segue
 * desativada (D-30): a fonte AniDB é o HTML colado por um administrador
 * (Importações); o calendário vem da API pública da AniList via `calendar-loader`.
 */
export default async function AdminScrapersPage() {
  const { timeZone } = await requireAdminPage();
  const [aniDbJobs, aniDbLastOk, runs, runOk] = await Promise.all([
    prisma.adminJob.findMany({ where: { source: "AniDB" }, orderBy: { seq: "desc" }, take: 3 }),
    prisma.adminJob.findFirst({ where: { source: "AniDB", state: "SUCCESS" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
    prisma.ingestionRun.findMany({ where: { source: "calendar-loader" }, orderBy: { startedAt: "desc" }, take: 3 }),
    prisma.ingestionRun.findFirst({ where: { source: "calendar-loader", status: "OK" }, orderBy: { startedAt: "desc" } }),
  ]);
  const [imageRuns, imageRunOk, imageCount] = await Promise.all([
    prisma.episodeImageRun.findMany({ orderBy: { startedAt: "desc" }, take: 3 }),
    prisma.episodeImageRun.findFirst({ where: { status: { in: ["OK", "PARTIAL"] } }, orderBy: { startedAt: "desc" } }),
    prisma.episodeImage.count(),
  ]);
  const imageRunning = await isRunning();
  const [newsRuns, newsRunOk, newsCount, newsRunning] = await Promise.all([
    prisma.newsRun.findMany({ orderBy: { startedAt: "desc" }, take: 3 }),
    prisma.newsRun.findFirst({ where: { status: { in: ["OK", "PARTIAL"] } }, orderBy: { startedAt: "desc" } }),
    prisma.animeNews.count(),
    isNewsRunning(),
  ]);
  const aniDbLastError = await prisma.adminJob.findFirst({ where: { source: "AniDB", state: "FAILED" }, orderBy: { seq: "desc" } });
  const runError = await prisma.ingestionRun.findFirst({ where: { source: "calendar-loader", status: "ERROR" }, orderBy: { startedAt: "desc" } });

  const aniDbOnline = aniDbJobs[0]?.state !== "FAILED";
  const loaderOnline = runs[0] ? runs[0].status !== "ERROR" : false;

  const imageOnline = imageRuns[0]?.status !== "ERROR";
  const newsOnline = newsRuns[0]?.status !== "ERROR";
  const executions: Exec[] = [
    ...aniDbJobs.map((j) => ({
      key: `job-${j.seq}`,
      service: "AniDB",
      at: j.createdAt,
      ok: j.state !== "FAILED",
      result: j.state === "FAILED" ? `Failed · ${j.error ?? "falha"}` : j.state === "SUCCESS" ? `Success · ${j.total} parseados` : j.state === "CANCELLED" ? "Cancelled · cancelado antes do commit" : `Running · ${j.total} parseados, em revisão`,
      context: `#${j.seq} · ${j.state === "FAILED" ? "diagnóstico arquivado" : j.state === "SUCCESS" ? "lote concluído" : "prévia em revisão"}`,
    })),
    ...newsRuns.map((r) => ({
      key: `news-${r.id}`,
      service: "Notícias da temporada · Jikan",
      at: r.startedAt,
      ok: r.status !== "ERROR",
      result: r.status === "RUNNING" ? "Running · em execução" : r.status === "ERROR" ? `Failed · ${r.message ?? "erro"}` : `${r.status === "OK" ? "Success" : "Partial"} · ${r.fetched} notícias novas`,
      context: `${r.adminName ? `manual · ${r.adminName}` : "agendado"} · ${r.animes} obras`,
    })),
    ...imageRuns.map((r) => ({
      key: `img-${r.id}`,
      service: "Imagens dos episódios · Kitsu",
      at: r.startedAt,
      ok: r.status !== "ERROR",
      result: r.status === "RUNNING" ? "Running · em execução" : r.status === "ERROR" ? `Failed · ${r.message ?? "erro"}` : `${r.status === "OK" ? "Success" : "Partial"} · ${r.found} imagens novas`,
      context: `${r.trigger === "schedule" ? "agendado 00:00" : `manual${r.adminName ? ` · ${r.adminName}` : ""}`} · ${r.animes} animes`,
    })),
    ...runs.map((r) => ({
      key: `run-${r.id}`,
      service: "AniList · calendário",
      at: r.startedAt,
      ok: r.status !== "ERROR",
      result: r.status === "ERROR" ? `Failed · ${r.message ?? "erro"}` : `${r.status === "OK" ? "Success" : "Partial"} · ${r.itemsProcessed} episódios`,
      context: `calendar-loader · ${r.itemsFailed} falhas`,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const card = (title: string, online: boolean, lines: string[], note: string, action?: React.ReactNode) => (
    <Box component="section" aria-label={title} sx={{ ...adminPanelSx, gap: 2 }}>
      <Typography component="h2" sx={{ fontSize: 20 }}>
        {title}
      </Typography>
      <SmallChip tone={online ? "success" : "accent"} icon={online ? <CheckCircleOutlinedIcon /> : <ErrorOutlineOutlinedIcon />}>
        {online ? "Online" : "Falha na última execução"}
      </SmallChip>
      <Typography suppressHydrationWarning sx={{ fontSize: 16, lineHeight: 1.7 }}>
        {lines.join(" · ")}
      </Typography>
      {action && <Box>{action}</Box>}
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{note}</Typography>
    </Box>
  );

  return (
    <>
      <AdminPageHeader
        title="Scrapers"
        subtitle="Serviços independentes, execução explícita e observabilidade de origem."
        action={<SmallChip>Coleta de sites de terceiros desativada · D-30</SmallChip>}
      />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}>
        {card(
          "AniDB",
          aniDbOnline,
          [
            `Última execução · ${aniDbJobs[0] ? fmtClock(aniDbJobs[0].createdAt, timeZone) : "nunca"}`,
            `Último sucesso · ${aniDbLastOk?.finishedAt ? fmtClock(aniDbLastOk.finishedAt, timeZone) : "nunca"}`,
            `Último erro · ${aniDbLastError ? `${aniDbLastError.error ?? "falha"} (#${aniDbLastError.seq})` : "Nenhum"}`,
            `ParserVersion · ${PARSER_VERSION}`,
            "Fonte · HTML de temporada colado por admin",
            `Timezone operacional · ${timeZone}`,
          ],
          "Importar cria job e prévia, não commit automático.",
          <AdminButtonLink href="/admin/importacoes" icon={<FileDownloadOutlinedIcon />}>
            Importar HTML
          </AdminButtonLink>
        )}
        {card(
          "Imagens dos episódios · Kitsu",
          imageOnline,
          [
            `Última execução · ${imageRuns[0] ? `${fmtClock(imageRuns[0].startedAt, timeZone)} (${imageRuns[0].status === "RUNNING" ? "em execução" : imageRuns[0].trigger === "schedule" ? "agendada" : "manual"})` : "nunca"}`,
            `Último sucesso · ${imageRunOk ? fmtDayClock(imageRunOk.startedAt, timeZone) : "nunca"}`,
            `Resultado · ${imageRuns[0]?.message ?? "sem execução ainda"}`,
            `Imagens guardadas · ${imageCount}`,
            "Agenda · todo dia às 00:00 (America/Sao_Paulo)",
            "Fonte · API pública da Kitsu (mapeamento oficial AniList → Kitsu)",
          ],
          "Alimenta as imagens de episódio do calendário; sem imagem, o calendário usa a capa do anime. Executar agora força a busca fora do horário.",
          <RunEpisodeImagesButton running={imageRunning} />
        )}
        {card(
          "Notícias da temporada · Jikan",
          newsOnline,
          [
            `Última execução · ${newsRuns[0] ? `${fmtClock(newsRuns[0].startedAt, timeZone)} (${newsRuns[0].status === "RUNNING" ? "em execução" : newsRuns[0].adminName ? "manual" : "agendada"})` : "nunca"}`,
            `Último sucesso · ${newsRunOk ? fmtDayClock(newsRunOk.startedAt, timeZone) : "nunca"}`,
            `Resultado · ${newsRuns[0]?.message ?? "sem execução ainda"}`,
            `Notícias guardadas · ${newsCount}`,
            "Serviço · news-fetcher (chamado por este painel e uma vez por dia)",
            "Fonte · API pública da Jikan (espelho aberto da MyAnimeList)",
          ],
          "Alimenta Comunidade → Notícias com o que a imprensa publicou sobre as obras da temporada atual. Buscar notícias força a busca agora.",
          <RunNewsButton running={newsRunning} />
        )}
        {card(
          "AniList / calendário",
          loaderOnline || !runs[0],
          [
            `Última execução · ${runs[0] ? fmtClock(runs[0].startedAt, timeZone) : "nunca"}`,
            `Último sucesso · ${runOk ? fmtClock(runOk.startedAt, timeZone) : "nunca"}`,
            `Último erro · ${runError ? (runError.message ?? "falha") : "Nenhum"}`,
            "Fonte · API pública da AniList (AiringSchedule)",
            "Serviço independente da AniDB",
          ],
          "Executado automaticamente a cada 30 minutos pelo serviço calendar-loader; divergências entre fontes geram conflitos para revisão."
        )}
      </Box>

      {executions.length > 0 ? (
        <AdminTable
          caption="Execuções recentes"
          testId="admin-scrapers-table"
          rows={executions}
          rowKey={(e) => e.key}
          columns={[
            { key: "s", label: "Serviço", render: (e) => e.service },
            { key: "e", label: "Execução", render: (e) => <span suppressHydrationWarning>{fmtDayClock(e.at, timeZone)}</span> },
            { key: "r", label: "Resultado", render: (e) => e.result },
            { key: "c", label: "Job / Contexto", render: (e) => e.context },
          ]}
        />
      ) : (
        <AdminPanel>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="admin-scrapers-empty">
            Nenhuma execução registrada ainda. Importe uma temporada ou aguarde o próximo ciclo do calendar-loader.
          </Typography>
        </AdminPanel>
      )}

      <Notice tone="info" title="Saúde atual e erros históricos são diferentes">
        Uma fonte pode estar online agora e ter falhado antes: a falha de um job permanece em Jobs e Logs. Nenhum serviço funde seus estados nem apaga a origem de outro.
      </Notice>
      <AdminPanel title="Guardas de execução">
        <Typography sx={{ fontSize: 16 }}>
          Impedir execução duplicada do mesmo serviço enquanto Running. Falha de um serviço não bloqueia os demais; toda execução recebe jobID, fonte e timestamp. A coleta automática de sites de terceiros permanece desativada até a política D-30 ser aprovada.
        </Typography>
      </AdminPanel>
    </>
  );
}

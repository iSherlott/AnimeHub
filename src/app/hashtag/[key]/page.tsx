import { notFound } from "next/navigation";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { HashtagView } from "@/components/HashtagView";
import { prisma } from "@/lib/prisma";
import { canonicalHashtagKey } from "@/lib/hashtags";

type Params = { params: Promise<{ key: string }> };

/** Página de hashtag canônica (Figma `13:42068`) — leitura pública. */
export default async function HashtagPage({ params }: Params) {
  const { key: rawKey } = await params;
  let key: string;
  try {
    key = canonicalHashtagKey(decodeURIComponent(rawKey));
  } catch {
    notFound();
  }
  const hashtag = await prisma.hashtag.findUnique({ where: { key } });
  if (!hashtag) notFound();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Header />
      <Box sx={{ maxWidth: 960, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <HashtagView hashtagKey={hashtag.key} display={hashtag.display} kind={hashtag.kind} />
      </Box>
    </Box>
  );
}

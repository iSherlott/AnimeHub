import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { SinglePostView } from "@/components/SinglePostView";

type Params = { params: Promise<{ postId: string }> };

/** Página dedicada de discussão — leitura pública (Figma `13:42257`). */
export default async function PublicationPage({ params }: Params) {
  const { postId } = await params;
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Header />
      <Box sx={{ maxWidth: 640, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <SinglePostView postId={postId} />
      </Box>
    </Box>
  );
}

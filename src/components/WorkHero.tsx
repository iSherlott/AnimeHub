import type { ReactNode } from "react";
import { Box } from "@mui/material";
import { BackdropImage, CoverImage } from "@/components/CoverImage";

/**
 * Cabeçalho de toda obra, esteja ou não na sua lista: banner com a capa sobreposta e, ao lado, o que cada página
 * quer mostrar (`children`). Sem banner (comum nas obras do AniDB), a capa desfocada faz o papel dele — assim todas
 * abrem com o mesmo desenho.
 */
export function WorkHero({ bannerImage, coverImage, accentColor, children }: { bannerImage: string | null; coverImage: string | null; accentColor?: string | null; children: ReactNode }) {
  const backdrop = bannerImage ?? coverImage;
  return (
    <>
      <Box sx={{ position: "relative", height: { xs: 256, sm: 320 }, width: "100%", overflow: "visible" }}>
        <Box sx={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          {backdrop ? (
            <Box sx={{ position: "absolute", inset: 0, ...(bannerImage ? {} : { filter: "blur(18px)", transform: "scale(1.15)", opacity: 0.55 }) }}>
              <BackdropImage src={backdrop} />
            </Box>
          ) : (
            <Box sx={{ height: "100%", width: "100%", bgcolor: "background.paper" }} />
          )}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: accentColor ? `linear-gradient(to top, #0b0b0d, ${accentColor}66, transparent)` : "linear-gradient(to top, #0b0b0d, rgba(11,11,13,0.4), transparent)",
            }}
          />
        </Box>

        <Box
          sx={{
            position: "absolute",
            left: { xs: 24, sm: 40 },
            bottom: { xs: -56, sm: -80 },
            zIndex: 1,
            height: { xs: 224, sm: 288 },
            width: { xs: 160, sm: 192 },
            overflow: "hidden",
            border: 2,
            borderColor: "divider",
            bgcolor: "background.paper",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {coverImage ? <CoverImage src={coverImage} sizes="192px" /> : null}
        </Box>
      </Box>

      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 3,
          px: { xs: 3, sm: 5 },
          pt: { xs: "72px", sm: 3 },
          pl: { sm: `${192 + 40 + 24}px` },
        }}
      >
        {children}
      </Box>
    </>
  );
}

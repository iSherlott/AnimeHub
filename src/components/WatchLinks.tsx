import { Box, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";

/**
 * "Onde assistir": os sites de streaming que a AniList informa para a obra.
 * Cada link abre o site em outra aba (sem enviar o referenciador) — o app só
 * indica onde assistir, nunca registra consumo.
 */
export function WatchLinks({ links, emptyText = "Nenhum site de streaming informado pela fonte para esta obra." }: { links: Array<{ site: string; url: string }>; emptyText?: string }) {
  if (links.length === 0) {
    return (
      <Typography data-testid="watch-links-empty" sx={{ fontSize: 14, color: "text.secondary" }}>
        {emptyText}
      </Typography>
    );
  }
  return (
    <Box component="ul" data-testid="watch-links" sx={{ display: "flex", flexWrap: "wrap", gap: 1, m: 0, p: 0, listStyle: "none" }}>
      {links.map((link) => (
        <li key={link.site}>
          <AppLink
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            underline="none"
            sx={{ display: "inline-flex", alignItems: "center", minHeight: 44, px: 2, py: 1.5, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: "#171820", color: "text.primary", fontSize: 14, fontWeight: 700, "&:hover": { bgcolor: "#1d1e28" } }}
          >
            ↗ {link.site}
          </AppLink>
        </li>
      ))}
    </Box>
  );
}

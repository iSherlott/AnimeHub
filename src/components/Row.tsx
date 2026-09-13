import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

export function Row({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box component="section">
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: { xs: 3, sm: 5 } }}>
        <Box sx={{ width: 6, height: 16, bgcolor: "primary.main", transform: "skewX(-12deg)" }} />
        <Typography variant="h6" component="h2" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title}
        </Typography>
      </Box>

      <Box
        className="no-scrollbar"
        sx={{
          display: "flex",
          gap: { xs: 1, sm: 1.5 },
          overflowX: "auto",
          px: { xs: 3, sm: 5 },
          pb: 3,
          pt: 2,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

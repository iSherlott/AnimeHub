import type { ReactNode } from "react";
import { Box } from "@mui/material";

/**
 * Linha do tempo vertical (no desenho do Timeline do Material). A linha principal corre pela esquerda, com um ponto por item;
 * uma `branch` é uma ramificação: sai da linha por um traço e fica recuada (os OVA, ODA e filmes que não fazem parte da
 * história principal). `tone` pinta o ponto: done (já foi ao ar), next (o próximo), upcoming (ainda vai) e branch.
 */
export type TimelineTone = "done" | "next" | "upcoming" | "branch";

export type TimelineNode = {
  key: string;
  branch?: boolean;
  tone?: TimelineTone;
  testId?: string;
  data?: Record<string, string | undefined>;
  children: ReactNode;
};

const DOT = 14;
const RAIL_X = 12; // centro da linha principal
const CONTENT_X = 40;

const dotSx = (tone: TimelineTone) => ({
  position: "absolute" as const,
  top: 14,
  width: DOT,
  height: DOT,
  borderRadius: "50%",
  boxSizing: "border-box" as const,
  border: 2,
  borderColor: tone === "branch" ? "secondary.main" : tone === "upcoming" ? "text.secondary" : "primary.main",
  bgcolor: tone === "done" ? "primary.main" : tone === "next" ? "background.paper" : "background.default",
  boxShadow: tone === "next" ? "0 0 0 4px rgba(228, 0, 43, 0.28)" : "none",
});

export function VerticalTimeline({ nodes, label, testId }: { nodes: TimelineNode[]; label: string; testId?: string }) {
  return (
    <Box component="ol" aria-label={label} data-testid={testId} sx={{ listStyle: "none", p: 0, m: 0, "--ind": { xs: "24px", sm: "44px" } }}>
      {nodes.map((node) => {
        const tone = node.tone ?? (node.branch ? "branch" : "upcoming");
        return (
          <Box
            component="li"
            key={node.key}
            data-testid={node.testId}
            data-branch={node.branch ? "true" : undefined}
            {...Object.fromEntries(Object.entries(node.data ?? {}).map(([k, v]) => [`data-${k}`, v]))}
            sx={{
              position: "relative",
              pl: node.branch ? `calc(${CONTENT_X}px + var(--ind))` : `${CONTENT_X}px`,
              pb: 1.5,
              // A linha principal passa por todos os itens (inclusive pelos das ramificações).
              "&::before": { content: '""', position: "absolute", left: RAIL_X - 1, top: 0, bottom: 0, width: 2, bgcolor: "divider" },
              "&:first-of-type::before": { top: 20 },
              "&:last-of-type::before": { bottom: "auto", height: 20 },
              "&:only-child::before": { display: "none" },
            }}
          >
            {node.branch && <Box aria-hidden sx={{ position: "absolute", left: RAIL_X, top: 20, width: `calc(${CONTENT_X - RAIL_X - DOT / 2}px + var(--ind))`, height: 2, bgcolor: "secondary.main", opacity: 0.7 }} />}
            <Box aria-hidden sx={{ ...dotSx(tone), left: node.branch ? `calc(${CONTENT_X - DOT - 4}px + var(--ind))` : RAIL_X - DOT / 2 }} />
            {node.children}
          </Box>
        );
      })}
    </Box>
  );
}

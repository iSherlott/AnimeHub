import { Box, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { SideBox } from "@/components/SideBox";
import { MIN_WORKS_FOR_AFFINITY, type AffinityResult } from "@/lib/affinity";

/**
 * "Vocês têm 78% de gosto em comum" no perfil de outra pessoa (10/11/2026), com as obras em comum e o que ela
 * acompanha que você ainda não viu. Lista escondida ou bloqueio: a caixa nem aparece.
 */
export function AffinityBox({ result, firstName, compareHref }: { result: AffinityResult; firstName: string; compareHref?: string }) {
  if (result.kind === "hidden") return null;
  return (
    <SideBox id="afinidade" title="afinidade" testId="profile-affinity">
      {result.kind === "small" ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          Para comparar, as duas listas precisam de pelo menos {MIN_WORKS_FOR_AFFINITY} obras (sem contar as dropadas).
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography data-testid="affinity-percent" sx={{ fontSize: 32, fontWeight: 700, color: "primary.main", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {result.percent}%
            </Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>de gosto em comum</Typography>
          </Box>
          <Typography data-testid="affinity-common" sx={{ fontSize: 13 }}>
            {result.commonCount === 0 ? "Nenhuma obra em comum ainda." : `${result.commonCount} ${result.commonCount === 1 ? "obra em comum" : "obras em comum"}`}
            {result.sharedGenres.length > 0 && <Box component="span" sx={{ color: "text.secondary" }}>{` · gostam de ${result.sharedGenres.join(", ")}`}</Box>}
          </Typography>
          {result.onlyTheirs.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>{firstName} acompanha e você ainda não:</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2, display: "flex", flexDirection: "column", gap: 0.5 }}>
                {result.onlyTheirs.map((w) => (
                  <Box component="li" key={w.key} data-testid="affinity-only-theirs" sx={{ fontSize: 13 }}>
                    {w.href ? (
                      <AppLink href={w.href} underline="hover" sx={{ fontSize: 13, color: "text.primary" }}>
                        {w.title}
                      </AppLink>
                    ) : (
                      w.title
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}
      {compareHref && (
        <AppLink href={compareHref} underline="hover" data-testid="affinity-compare" sx={{ fontSize: 13, fontWeight: 700, color: "secondary.main", mt: 1.5, display: "inline-block" }}>
          Comparar as listas lado a lado →
        </AppLink>
      )}
    </SideBox>
  );
}

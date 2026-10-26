import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { UserAvatar } from "@/components/UserAvatar";
import { Pager, Panel } from "@/components/community/CommunityParts";
import { listMembers, MEMBERS_PAGE } from "@/lib/community";
import { canonical, getCommunity, getScope } from "../data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ pagina?: string }> };

/** Todos os membros da comunidade, de quem entrou por último a quem entrou primeiro. */
export default async function CommunityMembers({ params, searchParams }: Props) {
  const { key } = await params;
  await canonical(key, "/membros");
  const scope = await getScope(key);
  if (!scope) notFound();
  const page = Math.max(1, Number((await searchParams).pagina) || 1);
  const community = await getCommunity(key);
  const { total, rows } = community ? await listMembers(community.id, page - 1) : { total: 0, rows: [] };
  return (
    <Panel title={`Membros (${total})`} testId="community-members">
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Ainda sem membros.</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "repeat(3, minmax(0,1fr))", sm: "repeat(5, minmax(0,1fr))", lg: "repeat(6, minmax(0,1fr))" }, gap: 2 }}>
          {rows.map((m) => (
            <Box component="li" key={m.id} data-testid={`member-${m.id}`}>
              <AppLink href={`/users/${m.id}`} underline="hover" sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75, color: "text.primary", fontSize: 13, textAlign: "center", overflowWrap: "anywhere" }}>
                <UserAvatar id={m.id} displayName={m.displayName} avatarUrl={m.avatarUrl} size={64} />
                {m.displayName}
              </AppLink>
            </Box>
          ))}
        </Box>
      )}
      <Pager basePath={`/comunidades/${scope.key}/membros`} page={page} pages={Math.max(1, Math.ceil(total / MEMBERS_PAGE))} />
    </Panel>
  );
}

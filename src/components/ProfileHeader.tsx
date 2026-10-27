"use client";

import { useState, type ReactNode } from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { AchievementTitleBadge } from "@/components/AchievementTitleBadge";
import { FollowToggle } from "@/components/FollowToggle";
import { LinkButton } from "@/components/LinkButton";
import { ProfileSafetyMenu } from "@/components/ProfileSafetyMenu";
import { UserAvatar } from "@/components/UserAvatar";

/**
 * Bloco de identidade do perfil (Figma `13:42598` / `13:42736`, no estilo da Crunchyroll): banner (de uma obra
 * que a pessoa acompanha), avatar redondo sobreposto, nome, @identificador, título equipado, bio, contagens e
 * ações. Cliente só para ajustar "N seguidores" otimisticamente junto do toggle de seguir. O avatar e o banner
 * se escolhem em "Editar perfil", sempre entre as imagens das obras acompanhadas (não há foto própria).
 */
export function ProfileHeader({
  userId,
  displayName,
  handle,
  avatarUrl,
  bannerUrl = null,
  bio,
  title = null,
  postCount,
  initialFollowerCount,
  followingCount,
  isOwnProfile,
  viewerLoggedIn,
  initialFollowing,
  friendAction = null,
}: {
  userId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  bio: string | null;
  /** Ação de amizade (perfil social), ao lado de "Seguir perfil". */
  friendAction?: ReactNode;
  /** Título equipado (conquista do quiz), se houver. */
  title?: string | null;
  postCount: number;
  initialFollowerCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  viewerLoggedIn: boolean;
  initialFollowing: boolean;
}) {
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }} data-testid="profile-header">
      <Box
        sx={{
          height: { xs: 120, sm: 168 },
          borderRadius: "12px 12px 0 0",
          overflow: "hidden",
          bgcolor: "#171820",
          background: bannerUrl ? undefined : "linear-gradient(135deg, #1b152b 0%, #171820 60%, #2c111b 100%)",
        }}
      >
        {bannerUrl && <Box component="img" src={bannerUrl} alt="" data-testid="profile-banner" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </Box>
      <Stack direction="row" spacing={3} sx={{ alignItems: "flex-start", px: { xs: 0, sm: 1 } }}>
        <Box sx={{ mt: "-40px", width: 96, height: 96, flexShrink: 0, borderRadius: "50%", border: "4px solid", borderColor: "background.default", bgcolor: "background.default" }}>
          <UserAvatar id={userId} displayName={displayName} avatarUrl={avatarUrl} size={88} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          <Box>
            <Typography component="h2" sx={{ fontSize: 26, lineHeight: 1.3 }}>
              {displayName}
            </Typography>
            {handle && (
              <Typography data-testid="profile-handle" sx={{ fontSize: 14, color: "text.secondary" }}>
                @{handle}
              </Typography>
            )}
          </Box>
          {title && <AchievementTitleBadge title={title} />}
          {bio && <Typography sx={{ fontSize: 16, whiteSpace: "pre-wrap" }}>{bio}</Typography>}
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            {followerCount} {followerCount === 1 ? "seguidor" : "seguidores"} · {followingCount} seguindo · {postCount}{" "}
            {postCount === 1 ? "publicação" : "publicações"}
          </Typography>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
            {isOwnProfile ? (
              <>
                <LinkButton href="/publicar" variant="contained">
                  + Nova publicação
                </LinkButton>
                <LinkButton href="/perfil/editar" data-testid="profile-edit-open" sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}>
                  Editar perfil
                </LinkButton>
              </>
            ) : viewerLoggedIn ? (
              <>
                <FollowToggle
                  userId={userId}
                  initialFollowing={initialFollowing}
                  onChange={(following) => setFollowerCount((c) => c + (following ? 1 : -1))}
                />
                {friendAction}
                <ProfileSafetyMenu userId={userId} displayName={displayName} />
              </>
            ) : (
              <>
                <Tooltip title="Entre para seguir">
                  <span>
                    <FollowToggle userId={userId} initialFollowing={false} disabled />
                  </span>
                </Tooltip>
                {friendAction}
              </>
            )}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

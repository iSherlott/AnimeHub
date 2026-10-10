"use client";

import { useState } from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { AvatarUploader } from "@/components/AvatarUploader";
import { FollowToggle } from "@/components/FollowToggle";
import { LinkButton } from "@/components/LinkButton";
import { ProfileEditDialog } from "@/components/ProfileEditDialog";
import { ProfileSafetyMenu } from "@/components/ProfileSafetyMenu";
import { UserAvatar } from "@/components/UserAvatar";

/**
 * Bloco de identidade do perfil (Figma `13:42598` / `13:42736`): avatar,
 * nome, @identificador, bio, contagens e ações. Cliente só para ajustar
 * "N seguidores" otimisticamente junto do toggle de seguir — sem isso o
 * contador ficava parado até um reload (achado da 3ª rodada, Epic 18).
 * Avatar editável só aparece em `isOwnProfile` (Epic 28).
 */
export function ProfileHeader({
  userId,
  displayName,
  handle,
  avatarUrl,
  bio,
  postCount,
  initialFollowerCount,
  followingCount,
  isOwnProfile,
  viewerLoggedIn,
  initialFollowing,
}: {
  userId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  bio: string | null;
  postCount: number;
  initialFollowerCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  viewerLoggedIn: boolean;
  initialFollowing: boolean;
}) {
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);

  return (
    <Stack direction="row" spacing={3} sx={{ alignItems: "flex-start" }}>
      {isOwnProfile ? (
        <AvatarUploader userId={userId} displayName={displayName} avatarUrl={avatarUrl} />
      ) : (
        <UserAvatar id={userId} displayName={displayName} avatarUrl={avatarUrl} size={64} />
      )}
      <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
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
              <ProfileEditDialog displayName={displayName} handle={handle} bio={bio} />
            </>
          ) : viewerLoggedIn ? (
            <>
              <FollowToggle
                userId={userId}
                initialFollowing={initialFollowing}
                onChange={(following) => setFollowerCount((c) => c + (following ? 1 : -1))}
              />
              <ProfileSafetyMenu userId={userId} displayName={displayName} />
            </>
          ) : (
            <Tooltip title="Entre para seguir">
              <span>
                <FollowToggle userId={userId} initialFollowing={false} disabled />
              </span>
            </Tooltip>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}

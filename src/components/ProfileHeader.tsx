"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Box, Button, Stack, Tooltip, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { ProfileEditDialog } from "@/components/ProfileEditDialog";
import { AvatarUploader } from "@/components/AvatarUploader";
import { BioEditor } from "@/components/BioEditor";
import { FollowToggle } from "@/components/FollowToggle";
import { UserAvatar } from "@/components/UserAvatar";
import { ProfileSafetyMenu } from "@/components/ProfileSafetyMenu";

/**
 * Avatar + nome + botão Seguir + contadores + bio, num componente
 * cliente só pra poder ajustar "N seguidores" otimisticamente junto do
 * toggle — sem isso, o contador ficava visivelmente parado até um
 * reload inteiro da página (achado real da 3ª rodada de auditoria,
 * Epic 18). Avatar/bio editáveis só aparecem quando `isOwnProfile`
 * (Epic 28) — não existe edição de perfil alheio.
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
    <Stack direction="row" spacing={2.5} sx={{ alignItems: "flex-start", mb: 3 }}>
      {isOwnProfile ? (
        <AvatarUploader userId={userId} displayName={displayName} avatarUrl={avatarUrl} />
      ) : (
        <UserAvatar id={userId} displayName={displayName} avatarUrl={avatarUrl} size={96} />
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", mb: 1 }}
        >
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            {displayName}
          </Typography>
          {!isOwnProfile &&
            (viewerLoggedIn ? (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <FollowToggle
                  userId={userId}
                  initialFollowing={initialFollowing}
                  onChange={(following) => setFollowerCount((c) => c + (following ? 1 : -1))}
                />
                <ProfileSafetyMenu userId={userId} displayName={displayName} />
              </Stack>
            ) : (
              <Tooltip title="Entre para seguir">
                <span>
                  <FollowToggle userId={userId} initialFollowing={false} disabled />
                </span>
              </Tooltip>
            ))}
        </Stack>
        {handle && (
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 0.5 }} data-testid="profile-handle">
            @{handle}
          </Typography>
        )}
        {isOwnProfile && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mb: 1.5 }}>
            <ProfileEditDialog displayName={displayName} handle={handle} />
            <Button component={NextLink} href="/minha-lista" size="small" variant="outlined" startIcon={<LockOutlinedIcon />}>
              Minha Lista privada
            </Button>
            <Button component={NextLink} href="/" size="small" variant="contained">
              + Nova publicação
            </Button>
          </Stack>
        )}
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          {postCount} {postCount === 1 ? "post" : "posts"} · {followerCount}{" "}
          {followerCount === 1 ? "seguidor" : "seguidores"} · {followingCount} seguindo
        </Typography>
        {bio && !isOwnProfile && (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {bio}
          </Typography>
        )}
        {isOwnProfile && (
          <>
            {bio && (
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 0.5 }}>
                {bio}
              </Typography>
            )}
            <BioEditor bio={bio} />
          </>
        )}
      </Box>
    </Stack>
  );
}

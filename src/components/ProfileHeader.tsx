"use client";

import { useState } from "react";
import { Stack, Tooltip, Typography } from "@mui/material";
import { FollowToggle } from "@/components/FollowToggle";

/**
 * Nome + botão Seguir + contadores, num componente cliente só pra poder
 * ajustar "N seguidores" otimisticamente junto do toggle — sem isso, o
 * contador ficava visivelmente parado até um reload inteiro da página
 * (achado real da 3ª rodada de auditoria, Epic 18).
 */
export function ProfileHeader({
  userId,
  displayName,
  postCount,
  initialFollowerCount,
  followingCount,
  isOwnProfile,
  viewerLoggedIn,
  initialFollowing,
}: {
  userId: string;
  displayName: string;
  postCount: number;
  initialFollowerCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  viewerLoggedIn: boolean;
  initialFollowing: boolean;
}) {
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);

  return (
    <>
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
            <FollowToggle
              userId={userId}
              initialFollowing={initialFollowing}
              onChange={(following) => setFollowerCount((c) => c + (following ? 1 : -1))}
            />
          ) : (
            <Tooltip title="Entre para seguir">
              <span>
                <FollowToggle userId={userId} initialFollowing={false} disabled />
              </span>
            </Tooltip>
          ))}
      </Stack>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        {postCount} {postCount === 1 ? "post" : "posts"} · {followerCount}{" "}
        {followerCount === 1 ? "seguidor" : "seguidores"} · {followingCount} seguindo
      </Typography>
    </>
  );
}

import { notFound } from "next/navigation";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { FollowToggle } from "@/components/FollowToggle";
import { UserPostList } from "@/components/UserPostList";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export default async function UserProfilePage({ params }: Params) {
  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, displayName: true },
  });
  if (!target) notFound();

  const viewer = await getCurrentUser();
  const [followerCount, followingCount, postCount, isFollowedByMe] = await Promise.all([
    prisma.follow.count({ where: { followingId: id } }),
    prisma.follow.count({ where: { followerId: id } }),
    prisma.post.count({ where: { userId: id, deletedAt: null } }),
    viewer
      ? prisma.follow
          .findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: id } } })
          .then((f) => f !== null)
      : Promise.resolve(false),
  ]);

  const isOwnProfile = viewer?.id === id;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Header />
      <Box sx={{ maxWidth: 640, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", mb: 1 }}
        >
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            {target.displayName}
          </Typography>
          {!isOwnProfile &&
            (viewer ? (
              <FollowToggle userId={id} initialFollowing={isFollowedByMe} />
            ) : (
              <Tooltip title="Entre para seguir">
                <span>
                  <FollowToggle userId={id} initialFollowing={false} disabled />
                </span>
              </Tooltip>
            ))}
        </Stack>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
          {postCount} posts · {followerCount} seguidores · {followingCount} seguindo
        </Typography>
        <UserPostList userId={id} />
      </Box>
    </Box>
  );
}

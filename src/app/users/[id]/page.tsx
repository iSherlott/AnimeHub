import { notFound } from "next/navigation";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { ProfileHeader } from "@/components/ProfileHeader";
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
        <ProfileHeader
          userId={id}
          displayName={target.displayName}
          postCount={postCount}
          initialFollowerCount={followerCount}
          followingCount={followingCount}
          isOwnProfile={isOwnProfile}
          viewerLoggedIn={Boolean(viewer)}
          initialFollowing={isFollowedByMe}
        />
        <UserPostList userId={id} />
      </Box>
    </Box>
  );
}

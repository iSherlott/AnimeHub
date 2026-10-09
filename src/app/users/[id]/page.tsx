import { notFound } from "next/navigation";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { ProfileHeader } from "@/components/ProfileHeader";
import { ProfileTabs } from "@/components/ProfileTabs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { blockRelation } from "@/lib/blocks";
import { BlockedProfileNotice } from "@/components/BlockedProfileNotice";

type Params = { params: Promise<{ id: string }> };

export default async function UserProfilePage({ params }: Params) {
  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, displayName: true, handle: true, avatarUrl: true, bio: true },
  });
  if (!target) notFound();

  const viewer = await getCurrentUser();

  // Bloqueio (Figma 13:43571): sem bio, posts nem listas por trás do bloqueio.
  // Quem foi bloqueado recebe a mesma mensagem neutra de "indisponível"
  // (404), sem revelar quem bloqueou quem nem por quê.
  const relation = await blockRelation(viewer?.id ?? null, id);
  if (relation === "blocked-me") notFound();
  if (relation === "blocked-by-me") {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
        <Header />
        <Box sx={{ maxWidth: 640, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
          <BlockedProfileNotice userId={id} displayName={target.displayName} />
        </Box>
      </Box>
    );
  }

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
          handle={target.handle}
          avatarUrl={target.avatarUrl}
          bio={target.bio}
          postCount={postCount}
          initialFollowerCount={followerCount}
          followingCount={followingCount}
          isOwnProfile={isOwnProfile}
          viewerLoggedIn={Boolean(viewer)}
          initialFollowing={isFollowedByMe}
        />
        <ProfileTabs userId={id} isOwnProfile={isOwnProfile} />
      </Box>
    </Box>
  );
}

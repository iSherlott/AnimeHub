import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizeHandle } from "@/lib/handle";

type Props = { params: Promise<{ handle: string }> };

/** `/u/<@>`: o link das menções com @ (12/11/2026) leva ao perfil da pessoa. Só para quem tem conta (memberOnly). */
export default async function HandleRedirect({ params }: Props) {
  const handle = normalizeHandle(decodeURIComponent((await params).handle));
  const user = /^[a-z0-9_]{3,20}$/.test(handle) ? await prisma.user.findUnique({ where: { handle }, select: { id: true } }) : null;
  if (!user) notFound();
  redirect(`/users/${user.id}`);
}

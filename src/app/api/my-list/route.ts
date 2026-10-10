import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { loadMyListEntries } from "@/lib/myList";

/** Minha Lista com a situação de agenda de cada obra (usada pelo Dashboard). Privada: só do próprio usuário. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ entries: await loadMyListEntries(user.id) });
}

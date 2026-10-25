import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { searchLinkableWorks } from "@/lib/workLinkActions";

/** Admin → Match name: busca por nome das obras da plataforma, para ligar duas à mão. */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ works: await searchLinkableWorks(q) });
}

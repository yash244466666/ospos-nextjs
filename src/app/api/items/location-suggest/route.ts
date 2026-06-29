import { auth } from "@/lib/auth/options";
import { getLocationSuggestions } from "@/lib/items/repository";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json([], { status: 401 });
  const url = new URL(req.url);
  const term = url.searchParams.get("term") ?? "";
  return Response.json(getLocationSuggestions(term));
}

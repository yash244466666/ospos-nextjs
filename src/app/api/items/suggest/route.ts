import { auth } from "@/lib/auth/options";
import { getStockSearchSuggestions } from "@/lib/items/repository";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json([], { status: 401 });
  const url = new URL(req.url);
  const term = url.searchParams.get("term") ?? "";
  const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);
  if (!term) return Response.json([]);
  const items = getStockSearchSuggestions(term, limit);
  return Response.json(items);
}

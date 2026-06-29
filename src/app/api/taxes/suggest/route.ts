import { auth } from "@/lib/auth/options";
import { getAllTaxCodes } from "@/lib/taxes/repository";

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json([], { status: 401 });
  return Response.json(getAllTaxCodes());
}

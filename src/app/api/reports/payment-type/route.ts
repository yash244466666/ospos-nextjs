import { auth } from "@/lib/auth/options";
import { getPaymentOptions } from "@/lib/sale/sale-model";

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json([], { status: 401 });
  return Response.json(getPaymentOptions());
}

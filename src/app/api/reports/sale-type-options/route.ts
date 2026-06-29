import { auth } from "@/lib/auth/options";

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json([], { status: 401 });
  return Response.json([
    { id: 0, label: "POS" },
    { id: 1, label: "Invoice" },
    { id: 2, label: "Work Order" },
    { id: 3, label: "Quote" },
    { id: 4, label: "Return" },
  ]);
}

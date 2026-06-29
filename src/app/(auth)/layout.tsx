import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user) redirect("/");
  return children;
}
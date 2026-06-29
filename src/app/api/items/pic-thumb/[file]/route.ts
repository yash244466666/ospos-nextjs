import path from "path";
import fs from "fs";
import { auth } from "@/lib/auth/options";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "item_pics");

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { file } = await ctx.params;
  // Path-traversal guard: only accept the basename, no slashes or `..`
  const safe = path.basename(file);
  if (safe !== file || safe.includes("..") || safe.includes("/") || safe.includes("\\")) {
    return new Response("Invalid file", { status: 400 });
  }
  const fullPath = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(fullPath)) return new Response("Not found", { status: 404 });
  const buf = fs.readFileSync(fullPath);
  const ext = path.extname(safe).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" :
    ext === ".gif" ? "image/gif" :
    ext === ".webp" ? "image/webp" :
    "image/jpeg";
  return new Response(buf, { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300" } });
}

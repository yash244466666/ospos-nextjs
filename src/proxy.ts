import { auth } from "@/lib/auth/options";

// Refuse to boot in production if ALLOWED_HOSTNAMES is unset (GHSA-jchf-7hr6-h4f3 mitigation).
const ALLOWED = process.env.ALLOWED_HOSTNAMES;
const isProd = process.env.NODE_ENV === "production";
if (isProd && !ALLOWED) {
  console.error("[proxy] FATAL: ALLOWED_HOSTNAMES env var is required in production. Set it to a comma-separated list of allowed hostnames.");
  // Don't crash — the boot will continue but every request will be refused.
}

function hostAllowed(host: string | null): boolean {
  if (!host) return false;
  const normalized = host.trim().toLowerCase();
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
  if (loopbackHosts.has(normalized)) return true;
  if (!ALLOWED) return !isProd;
  return ALLOWED.split(",").map((h) => h.trim().toLowerCase()).includes(normalized);
}

export default auth((req) => {
  // Allowed-hostnames gate
  const host = req.nextUrl.hostname || req.headers.get("host") || req.nextUrl.host;
  if (isProd && !hostAllowed(host)) {
    return new Response("Host not allowed", { status: 403 });
  }

  const path = req.nextUrl.pathname;
  const isPublic = path === "/login" || path.startsWith("/api/auth") || path.startsWith("/api/migrate");
  if (isPublic) return;
  if (!req.auth) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", path);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
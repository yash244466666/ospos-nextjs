/**
 * Origin check for mutating route handlers. Next.js Server Actions already get
 * an Origin/Host check from the framework and NextAuth validates its own CSRF
 * token; route handlers do not, so form-encoded POSTs must be checked here.
 * Upstream exempts only `/login` and `/migrate`, both handled elsewhere.
 */
export function isSameOrigin(request: Request): boolean {
  const host = request.headers.get("host");
  if (!host) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  // Some same-origin form posts omit Origin; Referer is the fallback. Requests
  // with neither header are rejected.
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).host === host;
  } catch {
    return false;
  }
}

export function csrfRejection(): Response {
  return new Response("Invalid request origin", { status: 403 });
}

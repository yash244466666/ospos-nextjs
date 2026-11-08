import { createHmac } from "node:crypto";

/**
 * Port of `App\Filters\Throttle` (upstream `app/Filters/Throttle.php`).
 *
 * CI4's Throttler is a fixed-window counter keyed per IP and per lowercased
 * username, backed by the server cache. `check()` increments the counter and
 * returns whether the attempt is still within capacity. The counter is not
 * reset on a successful login; it expires after the window.
 */

interface WindowCounter {
  count: number;
  resetAt: number;
}

const counters = new Map<string, WindowCounter>();

function readInt(name: string, uppercase: string, fallback: number): number {
  const raw = process.env[name] ?? process.env[uppercase];
  if (raw === undefined || !/^-?\d+$/.test(raw.trim())) return fallback;
  return Number.parseInt(raw, 10);
}

export function throttleCapacity(): number {
  return readInt("throttle.capacity", "THROTTLE_CAPACITY", 5);
}

export function throttleSeconds(): number {
  return Math.max(1, readInt("throttle.seconds", "THROTTLE_SECONDS", 60));
}

function throttleSecret(): string {
  // Upstream provisions `throttle.key` into .env when writable. The target has
  // no writable .env contract, so AUTH_SECRET (already mandatory in production)
  // is the fallback; a process-local secret is the last resort in development.
  return (
    process.env.THROTTLE_KEY ??
    process.env["throttle.key"] ??
    process.env.AUTH_SECRET ??
    "ospos-throttle-dev"
  );
}

export function throttleKey(kind: "ip" | "user", value: string): string {
  const normalized = kind === "user" ? value.toLowerCase() : value;
  const digest = createHmac("sha256", throttleSecret()).update(normalized).digest("hex");
  return `login-${kind}-${digest}`;
}

/**
 * Increments both counters and reports whether this attempt is allowed.
 * Returns true when `throttle.capacity` is <= 0 (disabled).
 */
export function checkThrottle(
  ip: string,
  username: string | null | undefined,
  now = Date.now(),
): boolean {
  const capacity = throttleCapacity();
  if (capacity <= 0) return true;
  const seconds = throttleSeconds();
  const keys = [throttleKey("ip", ip)];
  if (typeof username === "string" && username !== "") {
    keys.push(throttleKey("user", username.toLowerCase()));
  }

  let allowed = true;
  for (const key of keys) {
    const entry = counters.get(key);
    let count: number;
    if (!entry || entry.resetAt <= now) {
      count = 1;
      counters.set(key, { count, resetAt: now + seconds * 1000 });
    } else {
      entry.count += 1;
      count = entry.count;
    }
    if (count > capacity) allowed = false;
  }
  return allowed;
}

/** Test helper: clears every window. */
export function resetThrottle(): void {
  counters.clear();
}

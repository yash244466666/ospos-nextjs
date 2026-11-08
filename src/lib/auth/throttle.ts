interface Attempt {
  count: number;
  firstAt: number;
  blockedUntil: number;
}

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 60_000;

const attempts = new Map<string, Attempt>();

export function throttleKey(ip: string, username: string): string {
  return `${ip}|${username.toLowerCase()}`;
}

export function isLoginBlocked(ip: string, username: string, now = Date.now()): boolean {
  const entry = attempts.get(throttleKey(ip, username));
  if (!entry) return false;
  if (entry.blockedUntil > now) return true;
  if (now - entry.firstAt > WINDOW_MS) {
    attempts.delete(throttleKey(ip, username));
    return false;
  }
  return false;
}

export function recordLoginFailure(ip: string, username: string, now = Date.now()): void {
  const key = throttleKey(ip, username);
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_MS;
  }
}

export function recordLoginSuccess(ip: string, username: string): void {
  attempts.delete(throttleKey(ip, username));
}

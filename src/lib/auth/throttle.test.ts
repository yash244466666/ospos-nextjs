import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkThrottle, resetThrottle, throttleKey } from "./throttle";

const ENV_KEYS = ["throttle.capacity", "THROTTLE_CAPACITY", "throttle.seconds", "THROTTLE_SECONDS"] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
  for (const key of ENV_KEYS) delete process.env[key];
  resetThrottle();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetThrottle();
});

describe("login throttle (upstream Throttle filter)", () => {
  it("allows five attempts and blocks the sixth", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkThrottle("1.2.3.4", "admin", 1000 + i)).toBe(true);
    }
    expect(checkThrottle("1.2.3.4", "admin", 1010)).toBe(false);
  });

  it("blocks by IP even when the username changes", () => {
    for (let i = 0; i < 5; i++) checkThrottle("1.2.3.4", `user${i}`, 1000 + i);
    expect(checkThrottle("1.2.3.4", "someone-else", 1010)).toBe(false);
  });

  it("blocks by username from a different IP", () => {
    for (let i = 0; i < 5; i++) checkThrottle(`10.0.0.${i}`, "admin", 1000 + i);
    expect(checkThrottle("10.0.0.9", "admin", 1010)).toBe(false);
    expect(checkThrottle("10.0.0.9", "clerk", 1010)).toBe(true);
  });

  it("expires the window", () => {
    for (let i = 0; i < 5; i++) checkThrottle("1.2.3.4", "admin", 1000);
    expect(checkThrottle("1.2.3.4", "admin", 1001)).toBe(false);
    expect(checkThrottle("1.2.3.4", "admin", 1000 + 60_001)).toBe(true);
  });

  it("throttles by IP only when the username is empty or non-scalar", () => {
    for (let i = 0; i < 5; i++) checkThrottle("1.2.3.4", "", 1000 + i);
    expect(checkThrottle("1.2.3.4", "", 1010)).toBe(false);
    resetThrottle();
    for (let i = 0; i < 5; i++) checkThrottle("1.2.3.4", null, 1000 + i);
    expect(checkThrottle("1.2.3.4", null, 1010)).toBe(false);
  });

  it("honours a custom capacity", () => {
    process.env["throttle.capacity"] = "2";
    expect(checkThrottle("1.2.3.4", "admin", 1000)).toBe(true);
    expect(checkThrottle("1.2.3.4", "admin", 1001)).toBe(true);
    expect(checkThrottle("1.2.3.4", "admin", 1002)).toBe(false);
  });

  it("disables throttling at capacity zero", () => {
    process.env.THROTTLE_CAPACITY = "0";
    for (let i = 0; i < 50; i++) {
      expect(checkThrottle("1.2.3.4", "admin", 1000 + i)).toBe(true);
    }
  });

  it("falls back to five when the capacity is not an integer", () => {
    process.env["throttle.capacity"] = "five";
    for (let i = 0; i < 5; i++) checkThrottle("1.2.3.4", "admin", 1000 + i);
    expect(checkThrottle("1.2.3.4", "admin", 1010)).toBe(false);
  });

  it("hashes keys with HMAC and lowercases the username", () => {
    expect(throttleKey("user", "Admin")).toBe(throttleKey("user", "admin"));
    expect(throttleKey("ip", "1.2.3.4")).not.toBe(throttleKey("user", "1.2.3.4"));
  });
});

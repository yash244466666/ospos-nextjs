import { describe, expect, it, beforeEach } from "vitest";
import {
  isLoginBlocked,
  recordLoginFailure,
  recordLoginSuccess,
} from "./throttle";

describe("login throttle", () => {
  beforeEach(() => {
    recordLoginSuccess("1.2.3.4", "admin");
  });

  it("blocks after five failures within the window", () => {
    for (let i = 0; i < 4; i++) recordLoginFailure("1.2.3.4", "admin", 1000 + i);
    expect(isLoginBlocked("1.2.3.4", "admin", 1010)).toBe(false);
    recordLoginFailure("1.2.3.4", "admin", 1011);
    expect(isLoginBlocked("1.2.3.4", "admin", 1012)).toBe(true);
  });

  it("does not block another username or IP", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("1.2.3.4", "admin", 1000 + i);
    expect(isLoginBlocked("1.2.3.4", "clerk", 1010)).toBe(false);
    expect(isLoginBlocked("5.6.7.8", "admin", 1010)).toBe(false);
  });

  it("clears the block on success", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("1.2.3.4", "admin", 1000 + i);
    recordLoginSuccess("1.2.3.4", "admin");
    expect(isLoginBlocked("1.2.3.4", "admin", 1010)).toBe(false);
  });
});

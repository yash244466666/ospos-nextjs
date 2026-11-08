import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./csrf";

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/items/csv-import", {
    method: "POST",
    headers,
  });
}

describe("route-handler origin check", () => {
  it("accepts a matching Origin", () => {
    expect(isSameOrigin(request({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true);
  });

  it("rejects a foreign Origin", () => {
    expect(isSameOrigin(request({ host: "localhost:3000", origin: "https://evil.example" }))).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(
      isSameOrigin(request({ host: "localhost:3000", referer: "http://localhost:3000/items/csv-import" })),
    ).toBe(true);
  });

  it("rejects when neither Origin nor Referer is present", () => {
    expect(isSameOrigin(request({ host: "localhost:3000" }))).toBe(false);
  });

  it("rejects when the Host header is missing", () => {
    expect(isSameOrigin(request({ origin: "http://localhost:3000" }))).toBe(false);
  });

  it("rejects a malformed Origin", () => {
    expect(isSameOrigin(request({ host: "localhost:3000", origin: "not a url" }))).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionData: async () => ({}) }));
import { parseBarcode, parse, render } from "./index";

describe("Token_lib::render", () => {
  it("pads only with a numeric width", async () => {
    expect(await render("{FOO:3}", { overrides: {} })).toBe("000");
    expect(await render("{FOO}", {})).toBe("");
    expect(await render("{X:0}", { overrides: { X: "7" } })).toBe("7");
    expect(await render("{X:00}", { overrides: { X: "7" } })).toBe("7");
    expect(await render("{X:4}", { overrides: { X: "7" } })).toBe("0007");
  });

  it("replaces every occurrence and resolves once per ID", async () => {
    const result = await render("{X:2}-{X:4}", { overrides: { X: "7" } });
    expect(result).toBe("07-0007");
  });

  it("expands date directives before scanning", async () => {
    const result = await render("%%|%Y", {
      overrides: {},
      now: new Date("2026-11-08T08:05:09Z"),
    });
    expect(result).toBe("%|2026");
  });

  it("does not scan dollar-prefixed tokens", async () => {
    expect(await render("$CO", {})).toBe("$CO");
  });

  it("leaves unknown tokens empty", async () => {
    expect(await render("a{Q} b", {})).toBe("a b");
  });
});

describe("Token_lib::parse_barcode state machine", () => {
  it("fixture 1: I, W, P", () => {
    // The supplement's fixture says 99, but the regex captures the first three
    // digits of "0099" -> 009; the PHP state machine does the same.
    expect(parseBarcode("001212340099", ["{I:4}{W:4}{P:3}"])).toEqual({
      quantity: "1.234",
      price: 9,
      item: "0012",
    });
  });

  it("fixture 2: I only", () => {
    expect(parseBarcode("5901234123457", ["{I:13}"])).toEqual({
      quantity: "1",
      price: null,
      item: "5901234123457",
    });
  });

  it("fixture 3: W then I", () => {
    expect(parseBarcode("00123000112", ["{W:5}{I:6}"])).toEqual({
      quantity: "0.123",
      price: null,
      item: "000112",
    });
  });

  it("fixture 4: no formats leaves the input unchanged", () => {
    expect(parseBarcode("123", [])).toEqual({ quantity: "1", price: null, item: "123" });
  });

  it("fixture 5: last format wins for quantity", () => {
    // {I:4} matches "0012" in "00123"; the later {W:5} cannot match the
    // shortened value and only resets quantity/price.
    expect(parseBarcode("00123", ["{I:4}", "{W:5}"])).toEqual({
      quantity: "1",
      price: null,
      item: "0012",
    });
  });

  it("fixture 6: unanchored match", () => {
    expect(parseBarcode("ABCD-1234", ["{I:4}"])).toEqual({
      quantity: "1",
      price: null,
      item: "ABCD",
    });
  });

  it("fixture 7: P then I ignores trailing characters", () => {
    expect(parseBarcode("099123456", ["{P:3}{I:3}"])).toEqual({
      quantity: "1",
      price: 99,
      item: "123",
    });
  });
});

describe("Token_lib::parse", () => {
  it("replaces only the first spec per token ID, so duplicates do not match", () => {
    // The second "{I:4}" remains literal text in the regex (A.5).
    const result = parse("00120012", "{I:4}{I:4}", [{ tokenId: "I", value: "\\w" }]);
    expect(result).toEqual({});
  });

  it("returns no match for broken regex metacharacters", () => {
    expect(parse("abc", "{I:abc}", [{ tokenId: "I", value: "\\w" }])).toEqual({});
  });
});

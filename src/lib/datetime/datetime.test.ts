import { describe, expect, it } from "vitest";
import { formatDb, isValidDate, parseDb, strftime, toDb } from "@/lib/datetime";

const INSTANT = new Date("2026-11-08T08:05:09Z"); // 14:05:09 Asia/Dhaka

describe("strftime parity", () => {
  it("matches the en-US fixture from the supplement", () => {
    const out = strftime(
      "%a|%A|%b|%B|%c|%C|%d|%D|%e|%F|%g|%G|%h|%H|%I|%j|%m|%M|%p|%P|%r|%R|%S|%T|%u|%U|%V|%w|%W|%x|%X|%y|%Y|%z|%Z|%%",
      { now: INSTANT, timeZone: "Asia/Dhaka", locale: "en-US" },
    );
    expect(out).toBe(
      "Sun|Sunday|Nov|November|2026-11-08 14:05:09|20|08|11/08/26|8|2026-11-08|26|2026|Nov|14|02|312|11|05|PM|PM|02:05:09 PM|14:05|09|14:05:09|1|46|46|1|46|2026-11-08|14:05:09|26|2026|+06:00|GMT+6|%",
    );
  });

  it("matches the en-GB week and day-period deltas", () => {
    const out = strftime("%U|%V|%W|%u|%w|%p|%P", {
      now: INSTANT,
      timeZone: "Asia/Dhaka",
      locale: "en-GB",
    });
    expect(out).toBe("45|45|45|7|7|pm|pm");
  });

  it("localises bn-BD digits while keeping the offset ASCII", () => {
    const out = strftime("%d|%Y|%H|%j|%U|%z|%Z", {
      now: INSTANT,
      timeZone: "Asia/Dhaka",
      locale: "bn-BD",
    });
    expect(out).toBe("০৮|২০২৬|১৪|৩১২|৪৬|+06:00|GMT +৬");
  });

  it("leaves %l and unknown directives literal", () => {
    expect(strftime("%l|%q|%", { now: INSTANT, timeZone: "Asia/Dhaka" })).toBe("%l|%q|%");
  });

  it("handles %% %n %t before the table", () => {
    expect(strftime("%%|%n|%t", { now: INSTANT, timeZone: "Asia/Dhaka" })).toBe("%|\n|\t");
  });

  it("expands every occurrence", () => {
    expect(strftime("%Y-%Y", { now: INSTANT, timeZone: "Asia/Dhaka" })).toBe("2026-2026");
  });
});

describe("database datetime", () => {
  it("round-trips wall-clock values", () => {
    expect(toDb(parseDb("2026-11-08 14:05:09"))).toBe("2026-11-08 14:05:09");
  });

  it("formats with configured PHP patterns", () => {
    expect(formatDb("2026-11-08 14:05:09", "m/d/Y")).toBe("11/08/2026");
    expect(formatDb("2026-11-08 14:05:09", "H:i:s")).toBe("14:05:09");
    expect(formatDb("2026-11-08 14:05:09", "d/m/Y H:i")).toBe("08/11/2026 14:05");
  });

  it("rejects impossible dates", () => {
    expect(() => parseDb("2026-02-30 00:00:00")).toThrow();
  });

  it("validates configured date formats like createFromFormat", () => {
    expect(isValidDate("11/08/2026", "m/d/Y")).toBe(true);
    expect(isValidDate("31/11/2026", "d/m/Y")).toBe(false);
    expect(isValidDate("2026-11-08", "Y-m-d")).toBe(true);
    expect(isValidDate("2026-2-30", "Y-m-d")).toBe(false);
  });
});

import { expect, test } from "@playwright/test";
import { clockToMinutes, inDateTimeRange } from "../src/demo-data";

test.describe("date-time range", () => {
  test("parses kitchen clock times", () => {
    expect(clockToMinutes("1:10 PM")).toBe(13 * 60 + 10);
    expect(clockToMinutes("1:57 AM")).toBe(1 * 60 + 57);
    expect(clockToMinutes("12:05 AM")).toBe(5);
    expect(clockToMinutes("12:00 PM")).toBe(12 * 60);
    expect(clockToMinutes("13:10")).toBe(13 * 60 + 10);
  });

  test("keeps a 1:10 PM sale out of a morning window", () => {
    expect(
      inDateTimeRange("2026-09-25", "1:10 PM", "2026-09-25", "00:00", "2026-09-25", "08:00"),
    ).toBe(false);
    expect(
      inDateTimeRange("2026-09-25", "1:10 PM", "2026-09-25", "12:00", "2026-09-25", "18:00"),
    ).toBe(true);
  });

  test("still includes dateless expenses on that calendar day", () => {
    expect(
      inDateTimeRange("2026-09-25", undefined, "2026-09-25", "12:00", "2026-09-25", "18:00"),
    ).toBe(true);
  });
});

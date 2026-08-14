import { describe, expect, it } from "@jest/globals";
import {
  formatBytes,
  formatCount,
  formatParams,
  hashString,
  stripHtml,
} from "./format";

describe("formatBytes", () => {
  it("returns null for missing or non-positive values", () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(undefined)).toBeNull();
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(-5)).toBeNull();
  });

  it("formats byte magnitudes", () => {
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1048576)).toBe("1.00 MB");
    expect(formatBytes(1073741824)).toBe("1.00 GB");
  });

  it("uses adaptive precision", () => {
    expect(formatBytes(1500)).toBe("1.46 KB");
    expect(formatBytes(150000)).toBe("146 KB");
    expect(formatBytes(12_000_000_000)).toBe("11.2 GB");
  });
});

describe("formatCount", () => {
  it("formats with thousands separators", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatCount(1000)).toBe("1,000");
    expect(formatCount(0)).toBe("0");
  });

  it("returns null for missing or non-finite values", () => {
    expect(formatCount(null)).toBeNull();
    expect(formatCount(undefined)).toBeNull();
    expect(formatCount(Number.NaN)).toBeNull();
    expect(formatCount(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("formatParams", () => {
  it("formats billions and millions", () => {
    expect(formatParams(7_000_000_000)).toBe("7B params");
    expect(formatParams(1_500_000)).toBe("1.5M params");
  });

  it("keeps whole billions/millions compact", () => {
    expect(formatParams(2_000_000_000)).toBe("2B params");
  });

  it("falls back to plain numbers and null", () => {
    expect(formatParams(1000)).toBe("1,000 params");
    expect(formatParams(0)).toBeNull();
    expect(formatParams(null)).toBeNull();
  });
});

describe("hashString", () => {
  it("is stable across calls", () => {
    expect(hashString("climate data")).toBe(hashString("climate data"));
  });

  it("distinguishes different inputs", () => {
    expect(hashString("climate data")).not.toBe(hashString("climate-data"));
  });

  it("returns a base-36 string", () => {
    expect(hashString("anything")).toMatch(/^[0-9a-z]+$/);
  });
});

describe("stripHtml", () => {
  it("strips tags and decodes common entities", () => {
    expect(stripHtml("<p>Hello &amp; <b>world</b></p>")).toBe("Hello & world");
  });

  it("collapses whitespace and trims", () => {
    expect(stripHtml("  a\n  b   c  ")).toBe("a b c");
  });

  it("handles empty input", () => {
    expect(stripHtml(null)).toBe("");
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml("")).toBe("");
  });
});
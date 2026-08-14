import { describe, expect, it } from "@jest/globals";
import { isCommerciallyUsable, normalizeLicense } from "./license";

describe("normalizeLicense", () => {
  it("maps MIT", () => {
    expect(normalizeLicense("MIT License")).toEqual({
      license: "MIT",
      raw: "MIT License",
    });
  });

  it("maps Apache variants", () => {
    expect(normalizeLicense("Apache License 2.0").license).toBe("Apache-2.0");
    expect(normalizeLicense("apache-2.0").license).toBe("Apache-2.0");
    expect(normalizeLicense("Apache 2.0").license).toBe("Apache-2.0");
  });

  it("prefers CC-BY-NC over CC-BY when both appear", () => {
    expect(normalizeLicense("CC-BY-NC-4.0").license).toBe("CC-BY-NC");
    expect(normalizeLicense("CC BY-NC 4.0").license).toBe("CC-BY-NC");
  });

  it("maps CC-BY and public-domain markers", () => {
    expect(normalizeLicense("CC-BY-4.0").license).toBe("CC-BY");
    expect(normalizeLicense("CC0 1.0").license).toBe("Public Domain");
    expect(normalizeLicense("public domain").license).toBe("Public Domain");
    expect(normalizeLicense("Unlicense").license).toBe("Public Domain");
  });

  it("maps Open Data Commons (ODbL) as commercially usable", () => {
    expect(normalizeLicense("ODbL-1.0").license).toBe("CC-BY");
    expect(normalizeLicense("odc-odbl").license).toBe("CC-BY");
  });

  it("joins array inputs", () => {
    const r = normalizeLicense(["MIT", "Apache-2.0"]);
    expect(r.license).toBe("MIT");
    expect(r.raw).toBe("MIT Apache-2.0");
  });

  it("handles missing / non-string inputs", () => {
    expect(normalizeLicense(null)).toEqual({ license: "Unknown", raw: null });
    expect(normalizeLicense(undefined)).toEqual({ license: "Unknown", raw: null });
    expect(normalizeLicense(42)).toEqual({
      license: "Unknown",
      raw: "42",
    });
  });

  it("falls back to Unknown for unrecognized licenses", () => {
    expect(normalizeLicense("Some custom licence").license).toBe("Unknown");
  });
});

describe("isCommerciallyUsable", () => {
  it("allows permissive/open licenses", () => {
    for (const license of ["MIT", "Apache-2.0", "CC-BY", "Public Domain"]) {
      expect(isCommerciallyUsable(license as never)).toBe(true);
    }
  });

  it("blocks non-commercial and unknown licenses", () => {
    expect(isCommerciallyUsable("CC-BY-NC")).toBe(false);
    expect(isCommerciallyUsable("Unknown")).toBe(false);
  });
});
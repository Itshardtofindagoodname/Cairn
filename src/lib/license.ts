import type { LicenseId } from "./types";

/**
 * Map a raw license string from any source into a small common set:
 * MIT | Apache-2.0 | CC-BY | CC-BY-NC | Public Domain | Unknown
 */
export function normalizeLicense(
  raw: unknown,
): { license: LicenseId; raw: string | null } {
  let input = "";
  if (typeof raw === "string") input = raw;
  else if (Array.isArray(raw)) input = raw.join(" ");
  else if (raw !== null && raw !== undefined) input = String(raw);
  input = input.trim();
  if (!input) return { license: "Unknown", raw: null };

  const lower = input.toLowerCase();

  if (lower.includes("mit")) return { license: "MIT", raw: input };
  if (lower.includes("apache")) return { license: "Apache-2.0", raw: input };
  if (lower.includes("cc-by-nc") || lower.includes("cc by nc"))
    return { license: "CC-BY-NC", raw: input };
  if (lower.includes("cc-by") || lower.includes("cc by"))
    return { license: "CC-BY", raw: input };
  if (
    lower.includes("cc0") ||
    lower.includes("public domain") ||
    lower.includes("publicdomain") ||
    lower.includes("us-pd") ||
    lower === "pd" ||
    lower === "public" ||
    lower.includes("unlicense")
  )
    return { license: "Public Domain", raw: input };
  // Open Data Commons: ODbL allows commercial use with attribution/share-alike.
  if (lower.includes("odbl") || lower.includes("odc-odbl"))
    return { license: "CC-BY", raw: input };
  // Apache-2.0 with extra suffix variants
  if (lower.includes("apache 2")) return { license: "Apache-2.0", raw: input };

  return { license: "Unknown", raw: input };
}

export function isCommerciallyUsable(license: LicenseId): boolean {
  return license !== "CC-BY-NC" && license !== "Unknown";
}

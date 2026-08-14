import type { NextRequest } from "next/server";
import { checkLiveness } from "@/lib/reproducibility/liveness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/liveness?url=… — HEAD probe with 24h SQLite cache. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") ?? "";
  if (!url) {
    return Response.json({ status: "unknown", latencyMs: null }, { status: 400 });
  }
  const result = await checkLiveness(url);
  return Response.json(result);
}
import type { NextRequest } from "next/server";
import { getMaintenance } from "@/lib/reproducibility/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/maintenance?url=… — GitHub activity with 24h SQLite cache. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") ?? "";
  if (!url) {
    return Response.json({ status: "none" }, { status: 400 });
  }
  const result = await getMaintenance(url);
  return Response.json(result);
}
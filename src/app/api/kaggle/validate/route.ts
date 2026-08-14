import type { NextRequest } from "next/server";
import { validateKaggleCredentials } from "@/lib/kaggle-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/kaggle/validate { username, key }
 *
 * Verifies a user's personal Kaggle API credentials with one real call to the
 * Kaggle REST API. Uses the same shared request builder as the search adapter
 * (src/lib/kaggle-api.ts), so validation and search are guaranteed to hit
 * identical endpoints with identical auth. Credentials are read once, used,
 * and dropped — never persisted, logged, or cached server-side. The response
 * only reports validity.
 *
 * A 401/403 means the pair is wrong (deterministic "invalid"). Any other
 * failure (429/5xx/network) is "unable to verify" and the UI can let the user
 * retry.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    key?: string;
  };
  const username = body.username?.trim();
  const key = body.key?.trim();
  if (!username || !key) {
    return Response.json(
      { valid: false, error: "Username and key are required." },
      { status: 400 },
    );
  }

  try {
    const result = await validateKaggleCredentials(username, key);

    if (result.valid) return Response.json({ valid: true });
    if (!result.retryable) {
      return Response.json({
        valid: false,
        error:
          "Kaggle rejected those credentials. Make sure it's your username and an API key from kaggle.com/settings.",
      });
    }
    return Response.json({
      valid: false,
      error:
        result.status === 429
          ? "Kaggle is rate-limiting right now — try validating again in a minute."
          : "Couldn't reach Kaggle to verify. Check your network and try again.",
      retryable: true,
    });
  } catch {
    return Response.json({
      valid: false,
      error: "Couldn't reach Kaggle to verify. Check your network and try again.",
      retryable: true,
    });
  }
}
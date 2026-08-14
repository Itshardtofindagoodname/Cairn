import { kaggleSharedUsageRatio } from "@/lib/kaggle-rate-tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/config — capability flags for the client.
 *
 * - kaggleAvailable: a shared Kaggle key is configured server-side, so the
 *   source is offered in the dropdown (otherwise it's hidden and users only
 *   reach it via personal-key handoff once the shared budget is used up).
 * - groqAvailable / aiInsightDailyCap: whether the AI-powered features are
 *   configured and what the per-day insight budget is (for the UI copy).
 */
export async function GET() {
  return Response.json({
    kaggleAvailable: Boolean(
      process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY,
    ),
    kaggleBudgetRatio: Math.round(kaggleSharedUsageRatio() * 100),
    groqAvailable: Boolean(process.env.GROQ_API_KEY),
    aiInsightDailyCap: Number(process.env.AI_INSIGHT_DAILY_CAP ?? 50),
  });
}
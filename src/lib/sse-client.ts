/**
 * SSE-over-fetch client.
 *
 * EventSource can't send POST bodies or custom headers, which are required for
 * the type filter, intent expansion flag, and the user's own Kaggle
 * credentials. So Cairn streams the same `text/event-stream` format over a
 * `fetch` POST instead. This also gives us an AbortController for cancel.
 */

export interface SseHandlers {
  onEvent: (event: string, data: unknown) => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

function parseSse(buffer: string): {
  parsed: { event: string; data: string }[];
  remainder: string;
} {
  const blocks = buffer.split(/\r?\n\r?\n/);
  // The final segment has no terminator yet — it's an in-flight partial event.
  const remainder = blocks.pop() ?? "";
  const parsed: { event: string; data: string }[] = [];
  for (const block of blocks) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length > 0) parsed.push({ event, data: dataLines.join("\n") });
  }
  return { parsed, remainder };
}

export interface StreamSearchInput {
  body?: unknown;
  headers?: Record<string, string>;
}

export async function streamSearch(
  url: string,
  input: StreamSearchInput,
  handlers: SseHandlers,
): Promise<void> {
  const controller = new AbortController();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.headers ?? {}),
      },
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Search failed with HTTP ${res.status}`);
    }
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { parsed, remainder } = parseSse(buffer);
      buffer = remainder;
      for (const msg of parsed) {
        let data: unknown;
        try {
          data = JSON.parse(msg.data);
        } catch {
          data = msg.data;
        }
        handlers.onEvent(msg.event, data);
      }
    }
    handlers.onEnd?.();
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}
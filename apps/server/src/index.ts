import { auth } from "@test-evals/auth";
import { env } from "@test-evals/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { streamSSE } from "hono/streaming";
import { 
  startRun, 
  resumeRun, 
  getRuns, 
  getRun, 
  getRunCases, 
  getCaseResult, 
  getCachedCaseByTranscriptId,
  runEvents 
} from "./services/runner.service";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/", (c) => {
  return c.text("OK");
});

// Runs API
app.get("/api/v1/runs", async (c) => {
  const runs = await getRuns();
  return c.json(runs);
});

app.post("/api/v1/runs", async (c) => {
  const body = await c.req.json();
  const { strategy, model, dataset_filter, force } = body;
  
  if (!strategy) return c.json({ error: "Strategy is required" }, 400);
  
  const hasAnthropic = env.ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY.includes("placeholder");
  const hasGemini = env.GEMINI_API_KEY && !env.GEMINI_API_KEY.includes("here");

  const defaultModel = hasAnthropic 
    ? "claude-3-5-haiku-20241022" 
    : hasGemini 
      ? "gemini-1.5-flash" 
      : "claude-3-5-haiku-20241022";
  
  const run = await startRun(strategy, model || defaultModel, dataset_filter, force === true);
  return c.json(run);
});

app.get("/api/v1/runs/:id", async (c) => {
  const id = c.req.param("id");
  const run = await getRun(id);
  if (!run) return c.json({ error: "Run not found" }, 404);
  return c.json(run);
});

app.post("/api/v1/runs/:id/resume", async (c) => {
  const id = c.req.param("id");
  try {
    const run = await resumeRun(id);
    return c.json(run);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.get("/api/v1/runs/:id/cases", async (c) => {
  const id = c.req.param("id");
  const cases = await getRunCases(id);
  return c.json(cases);
});

app.get("/api/v1/cases/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getCaseResult(id);
  if (!result) return c.json({ error: "Case not found" }, 404);
  
  // Use cached cases to avoid re-reading 50 files from disk on every click
  const caseData = await getCachedCaseByTranscriptId(result.transcriptId);
  
  return c.json({
    ...result,
    transcript: caseData?.transcript,
    gold: caseData?.gold
  });
});

// SSE for progress
app.get("/api/v1/runs/:id/events", async (c) => {
  const id = c.req.param("id");
  
  return streamSSE(c, async (stream) => {
    const onProgress = (data: any) => {
      stream.writeSSE({
        data: JSON.stringify(data),
        event: "progress",
      });
    };

    const onComplete = () => {
      stream.writeSSE({
        data: JSON.stringify({ status: "completed" }),
        event: "complete",
      });
    };

    runEvents.on(`run:${id}:progress`, onProgress);
    runEvents.on(`run:${id}:complete`, onComplete);

    // Remove listeners when client disconnects to prevent memory leak
    stream.onAbort(() => {
      console.log(`SSE aborted for run ${id} — cleaning up listeners`);
      runEvents.off(`run:${id}:progress`, onProgress);
      runEvents.off(`run:${id}:complete`, onComplete);
    });

    // Keep connection alive with heartbeat
    while (true) {
      await stream.sleep(30000);
      stream.writeSSE({ data: "heartbeat", event: "ping" });
    }
  });
});

export default app;

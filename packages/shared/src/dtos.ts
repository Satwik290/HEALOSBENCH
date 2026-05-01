import { z } from "zod";

export const RunStrategySchema = z.enum(["zero_shot", "few_shot", "cot"]);

export const StartRunRequestSchema = z.object({
  strategy: RunStrategySchema,
  model: z.string().default("claude-haiku-4-5-20251001"),
  dataset_filter: z.number().optional().describe("Limit number of cases to run")
});

export type StartRunRequest = z.infer<typeof StartRunRequestSchema>;

export const RunStatusSchema = z.enum(["running", "paused", "completed", "failed"]);

// Response DTOs
export const RunSummarySchema = z.object({
  id: z.string(),
  strategy: RunStrategySchema,
  model: z.string(),
  totalCases: z.number(),
  completedCases: z.number(),
  status: RunStatusSchema,
  costUsd: z.number(),
  durationMs: z.number(),
  createdAt: z.string()
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

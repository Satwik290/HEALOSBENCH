import {
  jsonb,
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  real,
  boolean,
  index,
} from "drizzle-orm/pg-core";

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  strategy: text("strategy").notNull(),
  model: text("model").notNull(),
  totalCases: integer("total_cases").notNull(),
  completedCases: integer("completed_cases").notNull().default(0),
  status: text("status").notNull(), // running, paused, completed, failed
  costUsd: real("cost_usd").notNull().default(0),
  tokensInput: integer("tokens_input").notNull().default(0),
  tokensOutput: integer("tokens_output").notNull().default(0),
  tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
  tokensCacheWrite: integer("tokens_cache_write").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const caseResults = pgTable("case_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  transcriptId: text("transcript_id").notNull(),
  status: text("status").notNull(), // completed, failed
  error: text("error"),
  promptHash: text("prompt_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => {
  return [
    index("case_results_run_id_idx").on(table.runId),
    index("case_results_transcript_id_idx").on(table.transcriptId),
    index("case_results_prompt_hash_idx").on(table.promptHash),
  ];
});

export const evaluations = pgTable("evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseResultId: uuid("case_result_id").notNull().references(() => caseResults.id, { onDelete: "cascade" }).unique(),
  schemaValid: boolean("schema_valid").notNull(),
  hallucinationsCount: integer("hallucinations_count").notNull().default(0),
  fieldScores: jsonb("field_scores").notNull(), 
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const generations = pgTable("generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseResultId: uuid("case_result_id").notNull().references(() => caseResults.id, { onDelete: "cascade" }).unique(),
  rawOutput: jsonb("raw_output").notNull(),
  retries: integer("retries").notNull().default(0),
  tokensInput: integer("tokens_input").notNull().default(0),
  tokensOutput: integer("tokens_output").notNull().default(0),
  tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
  tokensCacheWrite: integer("tokens_cache_write").notNull().default(0),
  trace: jsonb("trace"), 
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

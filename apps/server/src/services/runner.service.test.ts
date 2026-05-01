import { describe, it, expect, beforeEach, mock } from "bun:test";
import { db, runs, caseResults } from "@test-evals/db";
import { resumeRun, getRun, getPromptHash } from "./runner.service";

mock.module("./extract.service", () => ({
  loadCases: mock(async () => Array.from({ length: 50 }, (_, i) => ({ transcriptId: `case_${(i+1).toString().padStart(3, '0')}`, transcript: "test", gold: {} }))),
  runExtractionForCase: mock(async () => ({}))
}));

describe("Runner Service — Resumability & Idempotency", () => {
  beforeEach(async () => {
    await db.delete(caseResults);
    await db.delete(runs);
  });
  describe("Resumable Runs", () => {
    it("should resume a run from the last completed case", async () => {
      // 1. Create a run manually to avoid background processing race
      const [run1] = await db.insert(runs).values({
        strategy: "zero_shot",
        model: "claude-3-5-haiku-20241022",
        totalCases: 5,
        status: "failed" // or "running"
      }).returning();

      if (!run1) throw new Error("Failed to create run1");

      expect(run1.id).toBeDefined();

      // 2. Simulate processing 3 cases by inserting them into DB
      const caseIds = ["case_001", "case_002", "case_003"];
      const promptHash = getPromptHash("zero_shot");

      for (const caseId of caseIds) {
        await db.insert(caseResults).values({
          runId: run1.id,
          transcriptId: caseId,
          status: "completed",
          promptHash: promptHash
        });
      }

      // 3. Resume the run
      const resumedRun = await resumeRun(run1.id);
      expect(resumedRun.remainingCases).toBe(2); // 5 total - 3 completed

      // 4. Verify DB shows run is re-running
      const updated = await getRun(run1.id);
      expect(updated?.status).toBe("running");
    });

    it("should not re-run already-completed cases on resume", async () => {
      const [run] = await db.insert(runs).values({
        strategy: "zero_shot",
        model: "claude-3-5-haiku-20241022",
        totalCases: 2,
        status: "running"
      }).returning();
      
      if (!run) throw new Error("Failed to create run");

      const promptHash = getPromptHash("zero_shot");

      await db.insert(caseResults).values({
        runId: run.id,
        transcriptId: "case_001",
        status: "completed",
        promptHash: promptHash
      });

      const resumedRun = await resumeRun(run.id);
      expect(resumedRun.remainingCases).toBe(1);
    });
  });

  describe("Idempotency (Prompt Hash Caching)", () => {
    it("should produce stable hashes for the same strategy", () => {
      const hash1 = getPromptHash("zero_shot");
      const hash2 = getPromptHash("zero_shot");
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256
    });

    it("should produce different hashes for different strategies", () => {
      const hash1 = getPromptHash("zero_shot");
      const hash2 = getPromptHash("few_shot");
      expect(hash1).not.toBe(hash2);
    });
  });
});

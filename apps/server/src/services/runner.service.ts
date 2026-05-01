import { db, runs, caseResults, evaluations, generations } from "@test-evals/db";
import { loadCases, runExtractionForCase } from "./extract.service";
import { evaluateCase } from "./evaluate.service";
import { type Strategy, STRATEGIES } from "@test-evals/llm";
import { eq, and, sql, desc } from "drizzle-orm";
import crypto from "crypto";
import { EventEmitter } from "events";

export const runEvents = new EventEmitter();
runEvents.setMaxListeners(100); // Prevent leak warnings for many concurrent SSE clients

// In-memory case cache to avoid re-reading disk on every API request
let caseCache: Awaited<ReturnType<typeof loadCases>> | null = null;
async function getCasesFromCache() {
  if (!caseCache) caseCache = await loadCases();
  return caseCache;
}

export async function getCachedCaseByTranscriptId(id: string) {
  const cases = await getCasesFromCache();
  return cases.find(c => c.transcriptId === id);
}

// Helper to hash prompt strategy configuration
function getPromptHash(strategy: Strategy): string {
  const config = STRATEGIES[strategy];
  return crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export async function startRun(strategy: Strategy, model: string, limit?: number, force: boolean = false) {
  // Pre-warm the cache
  const allCases = await getCasesFromCache();
  const cases = limit ? allCases.slice(0, limit) : allCases;
  
  // Create Run in DB
  const [run] = await db.insert(runs).values({
    strategy,
    model,
    totalCases: cases.length,
    status: "running"
  }).returning();

  if (!run) throw new Error("Failed to create run");

  // Process asynchronously
  processRun(run.id, cases, strategy, model, force).catch(e => console.error(`Run ${run.id} failed:`, e));
  
  return run;
}

export async function resumeRun(runId: string) {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  // Allow resuming any non-completed run (handles crash scenario where status stays "running" or "failed")
  if (!run) throw new Error("Run not found");
  if (run.status === "completed") throw new Error("Run already completed");

  const allCases = await getCasesFromCache();
  const limitedCases = run.totalCases < allCases.length ? allCases.slice(0, run.totalCases) : allCases;
  
  // Find completed case IDs
  const completedCases = await db.select({ transcriptId: caseResults.transcriptId })
    .from(caseResults)
    .where(and(eq(caseResults.runId, runId), eq(caseResults.status, "completed")));
    
  const completedIds = new Set(completedCases.map(c => c.transcriptId));
  const remainingCases = limitedCases.filter(c => !completedIds.has(c.transcriptId));
  
  // Update status
  await db.update(runs).set({ status: "running" }).where(eq(runs.id, runId));
  
  // Process asynchronously
  processRun(run.id, remainingCases, run.strategy as Strategy, run.model).catch(e => console.error(`Run ${run.id} resume failed:`, e));
  
  return { ...run, remainingCases: remainingCases.length };
}

async function processRun(runId: string, cases: any[], strategy: Strategy, model: string, force: boolean = false) {
  const promptHash = getPromptHash(strategy);
  const startTime = Date.now();
  
  // The extractWithRetry already uses a semaphore to limit concurrency.
  // All tasks are spawned but the semaphore gates actual LLM calls to ≤5 concurrent.
  const promises = cases.map(async (testCase) => {
    try {
      // Check Idempotency: is there already a success for this transcript & hash?
      let existing = [];
      if (!force) {
        existing = await db.select().from(caseResults)
          .where(and(
            eq(caseResults.transcriptId, testCase.transcriptId),
            eq(caseResults.promptHash, promptHash),
            eq(caseResults.status, "completed")
          )).limit(1);
      }
        
      let generation;
      let evalResult;
      let costIncrement = 0;
      
      const firstExisting = existing[0];
      if (firstExisting) {
        // Idempotent cache hit, skip LLM call
        const [gen] = await db.select().from(generations).where(eq(generations.caseResultId, firstExisting.id));
        const [ev] = await db.select().from(evaluations).where(eq(evaluations.caseResultId, firstExisting.id));
        generation = gen;
        evalResult = ev;
      } else {
        // Run LLM
        const result = await runExtractionForCase(testCase.transcript, strategy, model);
        
        // Evaluate
        const evaluation = evaluateCase(result.output, testCase.gold, testCase.transcript);
        
        // Save to DB (CaseResult, Evaluation, Generation)
        const [cr] = await db.insert(caseResults).values({
          runId,
          transcriptId: testCase.transcriptId,
          status: "completed",
          promptHash
        }).returning();
        
        if (!cr) throw new Error("Failed to create case result");

        const [gen] = await db.insert(generations).values({
          caseResultId: cr.id,
          rawOutput: result.output,
          retries: result.retries,
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
          tokensCacheRead: result.tokensCacheRead,
          tokensCacheWrite: result.tokensCacheWrite,
          trace: result.trace,
        }).returning();
        
        const [ev] = await db.insert(evaluations).values({
          caseResultId: cr.id,
          schemaValid: true, // If we reached here, zod parsed it
          hallucinationsCount: evaluation.hallucinationsCount,
          fieldScores: evaluation.scores,
        }).returning();
        
        generation = gen;
        evalResult = ev;
        
        // Cost calc (Haiku 3.5 pricing approx)
        costIncrement = (result.tokensInput * 0.25 + result.tokensOutput * 1.25) / 1000000;
      }
      
      // Update Run stats
      // Update Run stats atomically to avoid race conditions and undefined errors
      await db.update(runs).set({
        completedCases: sql`${runs.completedCases} + 1`,
        costUsd: sql`${runs.costUsd} + ${costIncrement}`,
        tokensInput: sql`${runs.tokensInput} + ${generation?.tokensInput || 0}`,
        tokensOutput: sql`${runs.tokensOutput} + ${generation?.tokensOutput || 0}`,
        tokensCacheRead: sql`${runs.tokensCacheRead} + ${generation?.tokensCacheRead || 0}`,
        tokensCacheWrite: sql`${runs.tokensCacheWrite} + ${generation?.tokensCacheWrite || 0}`,
      }).where(eq(runs.id, runId));
      
      runEvents.emit(`run:${runId}:progress`, { transcriptId: testCase.transcriptId, status: "completed" });
      
    } catch (e: any) {
      console.error(`Error processing case ${testCase.transcriptId}:`, e);
      
      await db.insert(caseResults).values({
        runId,
        transcriptId: testCase.transcriptId,
        status: "failed",
        error: e.message,
        promptHash
      });
      
      // Update Run stats
      // Update Run stats
      await db.update(runs).set({
        completedCases: sql`${runs.completedCases} + 1`,
      }).where(eq(runs.id, runId));
      
      runEvents.emit(`run:${runId}:progress`, { transcriptId: testCase.transcriptId, status: "failed" });
    }
  });

  await Promise.allSettled(promises);
  
  await db.update(runs).set({
    status: "completed",
    durationMs: Date.now() - startTime
  }).where(eq(runs.id, runId));
  
  runEvents.emit(`run:${runId}:complete`);
}

export async function getRuns() {
  return await db.select().from(runs).orderBy(desc(runs.createdAt));
}

export async function getRun(runId: string) {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  return run;
}

export async function getRunCases(runId: string) {
  return await db.select({
    id: caseResults.id,
    transcriptId: caseResults.transcriptId,
    status: caseResults.status,
    error: caseResults.error,
    evaluation: evaluations,
  })
    .from(caseResults)
    .leftJoin(evaluations, eq(caseResults.id, evaluations.caseResultId))
    .where(eq(caseResults.runId, runId))
    .orderBy(caseResults.transcriptId);
}

export async function getCaseResult(caseId: string) {
  const [result] = await db.select()
    .from(caseResults)
    .where(eq(caseResults.id, caseId));
    
  if (!result) return null;
  
  const [evaluation] = await db.select().from(evaluations).where(eq(evaluations.caseResultId, caseId));
  const [generation] = await db.select().from(generations).where(eq(generations.caseResultId, caseId));
  
  return {
    ...result,
    evaluation,
    generation
  };
}

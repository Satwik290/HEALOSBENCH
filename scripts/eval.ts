import { parseArgs } from "util";
import path from "path";
import dotenv from "dotenv";

// Load environment variables before importing anything else
dotenv.config({ path: path.resolve(process.cwd(), "apps/server/.env") });

import { startRun, getRun, getRunCases } from "../apps/server/src/services/runner.service";
import { Strategy } from "@test-evals/llm";

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      strategy: { type: "string", default: "zero_shot" },
      model: { type: "string", default: "claude-3-5-haiku-20241022" },
      limit: { type: "string" },
    },
    strict: false,
  });

  const strategy = values.strategy as Strategy;
  const model = values.model as string;
  const limit = values.limit ? parseInt(values.limit) : undefined;

  console.log(`\n🚀 Starting Evaluation Run`);
  console.log(`----------------------------`);
  console.log(`Strategy: ${strategy}`);
  console.log(`Model:    ${model}`);
  if (limit) console.log(`Limit:    ${limit} cases`);
  console.log(`----------------------------\n`);

  try {
    const run = await startRun(strategy, model, limit);
    console.log(`Run created: ${run.id}\n`);

    let completed = false;
    while (!completed) {
      const currentRun = await getRun(run.id);
      if (!currentRun) break;

      process.stdout.write(`\rProgress: ${currentRun.completedCases} / ${currentRun.totalCases} [${Math.round((currentRun.completedCases / currentRun.totalCases) * 100)}%]`);

      if (currentRun.status === "completed" || currentRun.status === "failed") {
        completed = true;
        console.log(`\n\nRun ${currentRun.status}!`);
        
        const cases = await getRunCases(run.id);
        printSummary(currentRun, cases);
        break;
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

function printSummary(run: any, cases: any[]) {
  console.log(`\nFinal Summary`);
  console.log(`=============`);
  console.log(`Total Cases:  ${run.totalCases}`);
  console.log(`Duration:    ${(run.durationMs / 1000).toFixed(1)}s`);
  console.log(`Total Cost:  $${run.costUsd.toFixed(4)}`);
  console.log(`Total Tokens: ${run.tokensInput + run.tokensOutput}`);
  console.log(``);

  const fields = ["chief_complaint", "vitals", "medications", "diagnoses", "plan", "follow_up"];
  const validCases = cases.filter(c => c.evaluation);
  
  console.log(`Field Performance (Avg F1/Accuracy)`);
  console.log(`----------------------------------`);
  
  fields.forEach(f => {
    const total = validCases.reduce((acc, curr) => acc + (curr.evaluation?.fieldScores?.[f] || 0), 0);
    const avg = validCases.length > 0 ? total / validCases.length : 0;
    console.log(`${f.padEnd(20)}: ${(avg * 100).toFixed(1)}%`);
  });

  const totalF1 = fields.reduce((acc, f) => {
    const total = validCases.reduce((a, c) => a + (c.evaluation?.fieldScores?.[f] || 0), 0);
    return acc + (validCases.length > 0 ? total / validCases.length : 0);
  }, 0) / fields.length;

  console.log(`----------------------------------`);
  console.log(`${"OVERALL F1".padEnd(20)}: ${(totalF1 * 100).toFixed(1)}%`);
  console.log(`\nDone. View full details at http://localhost:3001/runs/${run.id}\n`);
}

main();

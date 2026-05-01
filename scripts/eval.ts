import { parseArgs } from "util";
import path from "path";
import dotenv from "dotenv";
import { spawn } from "child_process";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), "apps/server/.env") });

async function main() {
  const envPath = path.resolve(process.cwd(), "apps/server/.env");
  const envExamplePath = path.resolve(process.cwd(), "apps/server/.env.example");

  if (!await Bun.file(envPath).exists()) {
    if (await Bun.file(envExamplePath).exists()) {
      console.log(`⚠️  .env not found in apps/server. Copying from .env.example...`);
      const exampleContent = await Bun.file(envExamplePath).text();
      await Bun.write(envPath, exampleContent);
      console.log(`✅ Created apps/server/.env. Please update it with your ANTHROPIC_API_KEY.\n`);
    } else {
      console.error(`❌ Error: apps/server/.env not found and no .env.example exists.`);
      process.exit(1);
    }
  }

  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      strategy: { type: "string", default: "zero_shot" },
      model: { type: "string", default: "claude-3-5-haiku-20241022" },
      limit: { type: "string" },
      serverUrl: { type: "string", default: "http://localhost:8787" },
    },
    strict: false,
  });

  const strategy = values.strategy as string;
  const model = values.model as string;
  const limit = typeof values.limit === "string" ? parseInt(values.limit) : undefined;
  const serverUrl = values.serverUrl as string;

  console.log(`\n🚀 HEALOSBENCH CLI Evaluation`);
  console.log(`----------------------------`);

  // Ensure DB is pushed
  console.log(`📂 Ensuring database schema is up to date...`);
  const dbPush = spawn("bun", ["run", "db:push"], {
    stdio: "inherit"
  });

  await new Promise((resolve) => {
    dbPush.on("close", (code) => {
      if (code !== 0) {
        console.warn(`⚠️  Warning: db:push exited with code ${code}. The evaluation might fail if the database is not ready.`);
      }
      resolve(null);
    });
  });
  console.log(``);

  console.log(`Strategy: ${strategy}`);
  console.log(`Model:    ${model}`);
  if (limit) console.log(`Limit:    ${limit} cases`);
  console.log(`Server:   ${serverUrl}`);
  console.log(`----------------------------\n`);

  let serverProcess: any = null;

  try {
    // Check if server is already running
    let isServerUp = false;
    try {
      const res = await fetch(`${serverUrl}/api/v1/runs`, { method: "GET" });
      if (res.ok) isServerUp = true;
    } catch (e) {}

    if (!isServerUp) {
      console.log(`📦 Starting server process...`);
      serverProcess = spawn("bun", ["run", "apps/server/src/index.ts"], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: "8787" },
        stdio: "ignore"
      });

      // Poll until ready
      let attempts = 0;
      while (attempts < 20) {
        try {
          const res = await fetch(`${serverUrl}/api/v1/runs`, { method: "GET" });
          if (res.ok) {
            isServerUp = true;
            break;
          }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }

      if (!isServerUp) {
        console.error(`\n❌ Error: Server failed to start on port 8787.`);
        console.error(`   Make sure your DATABASE_URL is correct in apps/server/.env and that your database is running.`);
        console.error(`   If using Docker, run: docker-compose up -d\n`);
        throw new Error("Server failed to start");
      }
      console.log(`✅ Server ready\n`);
    } else {
      console.log(`🔗 Connected to existing server at ${serverUrl}\n`);
    }

    // Start run
    const startRes = await fetch(`${serverUrl}/api/v1/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy, model, dataset_filter: limit })
    });
    
    if (!startRes.ok) throw new Error(`Failed to start run: ${await startRes.text()}`);
    const run = (await startRes.json()) as any;
    console.log(`Run ID: ${run.id}\n`);

    // Poll for completion
    let completed = false;
    while (!completed) {
      const runRes = await fetch(`${serverUrl}/api/v1/runs/${run.id}`);
      const currentRun = (await runRes.json()) as any;
      
      const progress = Math.round((currentRun.completedCases / currentRun.totalCases) * 100);
      process.stdout.write(`\rProgress: ${currentRun.completedCases} / ${currentRun.totalCases} [${progress}%]`);

      if (currentRun.status === "completed" || currentRun.status === "failed") {
        completed = true;
        console.log(`\n\nRun ${currentRun.status.toUpperCase()}!`);
        
        const casesRes = await fetch(`${serverUrl}/api/v1/runs/${run.id}/cases`);
        const cases = (await casesRes.json()) as any[];
        printSummary(currentRun, cases);
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  } finally {
    if (serverProcess) {
      console.log(`\n🛑 Stopping server process...`);
      serverProcess.kill();
    }
  }
}

function printSummary(run: any, cases: any[]) {
  console.log(`\nFinal Summary`);
  console.log(`=============`);
  console.log(`Total Cases:  ${run.totalCases}`);
  console.log(`Duration:    ${(run.durationMs / 1000).toFixed(1)}s`);
  console.log(`Total Cost:  $${run.costUsd.toFixed(4)}`);
  console.log(`Cache Read:  ${run.tokensCacheRead.toLocaleString()} tokens`);
  console.log(`Total Tokens: ${(run.tokensInput + run.tokensOutput).toLocaleString()}`);
  console.log(``);

  const fields = ["chief_complaint", "vitals", "medications", "diagnoses", "plan", "follow_up"];
  const validCases = cases.filter((c: any) => c.evaluation);
  
  console.log(`Field Performance (Avg F1/Accuracy)`);
  console.log(`----------------------------------`);
  
  fields.forEach(f => {
    const total = validCases.reduce((acc: number, curr: any) => acc + (curr.evaluation?.fieldScores?.[f] || 0), 0);
    const avg = validCases.length > 0 ? total / validCases.length : 0;
    console.log(`${f.padEnd(20)}: ${(avg * 100).toFixed(1)}%`);
  });

  const totalF1 = fields.reduce((acc: number, f: string) => {
    const total = validCases.reduce((a: number, c: any) => a + (c.evaluation?.fieldScores?.[f] || 0), 0);
    return acc + (validCases.length > 0 ? total / validCases.length : 0);
  }, 0) / fields.length;

  console.log(`----------------------------------`);
  console.log(`${"OVERALL F1".padEnd(20)}: ${(totalF1 * 100).toFixed(1)}%`);
  console.log(`\n✅ View full details at http://localhost:3001/runs/${run.id}\n`);
}

main();

import { db, runs } from "../packages/db/src/index";
import { desc } from "drizzle-orm";

async function main() {
  const allRuns = await db.select().from(runs).orderBy(desc(runs.createdAt));
  console.log(JSON.stringify(allRuns, null, 2));
  process.exit(0);
}

main().catch(console.error);

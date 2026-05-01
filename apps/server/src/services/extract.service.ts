import { extractWithRetry, type Strategy } from "@test-evals/llm";
import { readdir, readFile } from "fs/promises";
import path from "path";
import type { ExtractionType } from "@test-evals/shared";

const DATA_DIR = path.resolve(import.meta.dir, "../../../../data");
const TRANSCRIPTS_DIR = path.join(DATA_DIR, "transcripts");
const GOLD_DIR = path.join(DATA_DIR, "gold");

export interface CaseData {
  transcriptId: string;
  transcript: string;
  gold: ExtractionType;
}

export async function loadCases(limit?: number): Promise<CaseData[]> {
  const files = await readdir(TRANSCRIPTS_DIR);
  const txtFiles = files.filter(f => f.endsWith(".txt")).sort();
  
  const casesToLoad = limit ? txtFiles.slice(0, limit) : txtFiles;
  
  const cases: CaseData[] = [];
  
  for (const file of casesToLoad) {
    const transcriptId = file.replace(".txt", "");
    const transcriptPath = path.join(TRANSCRIPTS_DIR, file);
    const goldPath = path.join(GOLD_DIR, `${transcriptId}.json`);
    
    try {
      const transcript = await readFile(transcriptPath, "utf-8");
      const goldRaw = await readFile(goldPath, "utf-8");
      const gold = JSON.parse(goldRaw) as ExtractionType;
      
      cases.push({ transcriptId, transcript, gold });
    } catch (e) {
      console.error(`Failed to load case ${transcriptId}:`, e);
    }
  }
  
  return cases;
}

export async function runExtractionForCase(
  transcript: string,
  strategy: Strategy,
  model: string
) {
  return await extractWithRetry(transcript, strategy, model);
}

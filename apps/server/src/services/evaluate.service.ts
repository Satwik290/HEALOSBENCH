import type { ExtractionType } from "@test-evals/shared";

// Utility: Normalize text for fuzzy matching
export function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();
}

// Utility: Calculate a simple Jaccard similarity between two strings
export function calculateJaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(' '));
  const set2 = new Set(str2.split(' '));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// Hallucination Check
export function checkGrounding(predictedValue: string | number | null, transcript: string): boolean {
  if (predictedValue === null || predictedValue === "" || predictedValue === undefined) return true;
  
  const normalizedTranscript = normalizeText(transcript);
  const valStr = String(predictedValue);
  const normalizedPrediction = normalizeText(valStr);
  
  // 1. Direct match (case/punct insensitive)
  if (normalizedTranscript.includes(normalizedPrediction)) return true;
  
  // 2. If it's a multi-word string, check if significant words appear close to each other
  const words = normalizedPrediction.split(' ').filter(w => w.length > 3);
  if (words.length > 0) {
    const foundWords = words.filter(w => normalizedTranscript.includes(w));
    // If more than 70% of significant words are found, consider it grounded
    if (foundWords.length / words.length > 0.7) return true;
  }
  
  // 3. For short strings or single words, be stricter
  return false;
}

// Recursive Hallucination Check
export function countHallucinations(prediction: any, transcript: string): number {
  let count = 0;
  
  if (Array.isArray(prediction)) {
    for (const item of prediction) {
      count += countHallucinations(item, transcript);
    }
  } else if (prediction && typeof prediction === "object") {
    for (const key of Object.keys(prediction)) {
      count += countHallucinations(prediction[key], transcript);
    }
  } else if (typeof prediction === "string" || typeof prediction === "number") {
    if (!checkGrounding(prediction, transcript)) {
      count++;
    }
  }
  
  return count;
}

// --- Metrics per field ---

// chief_complaint: Fuzzy match (0-1)
export function evaluateChiefComplaint(pred: string, gold: string): number {
  const normPred = normalizeText(pred);
  const normGold = normalizeText(gold);
  return calculateJaccardSimilarity(normPred, normGold);
}

// vitals: exact/numeric-tolerant
export function evaluateVitals(pred: any, gold: any): number {
  if (!gold) return pred ? 0 : 1;
  let matches = 0;
  let total = 4;
  
  // BP: exact string match
  if (pred.bp === gold.bp) matches++;
  
  // HR: exact integer match
  if (pred.hr === gold.hr) matches++;
  
  // Temp: numeric tolerant +/- 0.2
  if (pred.temp_f === gold.temp_f) {
    matches++;
  } else if (pred.temp_f !== null && gold.temp_f !== null && Math.abs(pred.temp_f - gold.temp_f) <= 0.201) {
    matches++;
  }
  
  // SpO2: exact integer match
  if (pred.spo2 === gold.spo2) matches++;
  
  return matches / total;
}

// Set-based F1 Helper
function calculateSetF1<T>(preds: T[], golds: T[], matchFn: (p: T, g: T) => boolean): number {
  if (!preds || preds.length === 0) return golds.length === 0 ? 1 : 0;
  if (!golds || golds.length === 0) return 0;
  
  let truePositives = 0;
  const matchedGolds = new Set<number>();
  
  for (const p of preds) {
    for (let i = 0; i < golds.length; i++) {
      const gold = golds[i];
      if (gold !== undefined && !matchedGolds.has(i) && matchFn(p, gold)) {
        truePositives++;
        matchedGolds.add(i);
        break;
      }
    }
  }
  
  const precision = truePositives / preds.length;
  const recall = truePositives / golds.length;
  
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

// medications: F1
export function evaluateMedications(pred: any[], gold: any[]): number {
  return calculateSetF1(pred, gold, (p, g) => {
    // fuzzy match name
    const nameMatch = calculateJaccardSimilarity(normalizeText(p.name), normalizeText(g.name)) > 0.5;
    
    // normalize dose & freq
    const doseMatch = normalizeText(p.dose) === normalizeText(g.dose);
    
    // Handle semantic equivalents like BID == twice daily
    const normPFreq = normalizeText(p.frequency);
    const normGFreq = normalizeText(g.frequency);
    
    const isEquivalentFreq = (f1: string, f2: string) => {
      if (f1 === f2) return true;
      const pairs = [
        ["bid", "twice daily"], ["tid", "three times daily"], ["qd", "daily"], ["prn", "as needed"]
      ];
      for (const [a, b] of pairs) {
        if ((f1 === a && f2 === b) || (f1 === b && f2 === a)) return true;
      }
      return false;
    };
    
    const freqMatch = isEquivalentFreq(normPFreq, normGFreq);
    
    return nameMatch && doseMatch && freqMatch;
  });
}

// diagnoses: F1
// Per README: ICD10 is "bonus credit" — description match alone is sufficient for a TP.
// A matching ICD10 on top of a description match is still just one TP (no extra score).
export function evaluateDiagnoses(pred: any[], gold: any[]): number {
  return calculateSetF1(pred, gold, (p, g) => {
    const descSim = calculateJaccardSimilarity(normalizeText(p.description), normalizeText(g.description));
    if (descSim > 0.4) return true;
    // Bonus path: exact ICD10 match counts even if description phrasing differs
    if (p.icd10 && g.icd10 && p.icd10 === g.icd10) return true;
    return false;
  });
}

// plan: F1
export function evaluatePlan(pred: string[], gold: string[]): number {
  return calculateSetF1(pred, gold, (p, g) => calculateJaccardSimilarity(normalizeText(p), normalizeText(g)) > 0.5);
}

// follow_up: Exact interval, fuzzy reason
export function evaluateFollowUp(pred: any, gold: any): number {
  if (!gold) return pred ? 0 : 1;
  const intervalMatch = pred.interval_days === gold.interval_days;
  const reasonMatch = (!pred.reason && !gold.reason) || calculateJaccardSimilarity(normalizeText(pred.reason), normalizeText(gold.reason)) > 0.5;
  
  return (intervalMatch ? 0.5 : 0) + (reasonMatch ? 0.5 : 0);
}

export interface EvaluationScores {
  chief_complaint: number;
  vitals: number;
  medications: number;
  diagnoses: number;
  plan: number;
  follow_up: number;
}

export function evaluateCase(prediction: ExtractionType, gold: ExtractionType, transcript: string): {
  scores: EvaluationScores,
  hallucinationsCount: number,
  exactMatchScore: number
} {
  const scores: EvaluationScores = {
    chief_complaint: evaluateChiefComplaint(prediction.chief_complaint, gold.chief_complaint),
    vitals: evaluateVitals(prediction.vitals, gold.vitals),
    medications: evaluateMedications(prediction.medications, gold.medications),
    diagnoses: evaluateDiagnoses(prediction.diagnoses, gold.diagnoses),
    plan: evaluatePlan(prediction.plan, gold.plan),
    follow_up: evaluateFollowUp(prediction.follow_up, gold.follow_up),
  };
  
  const hallucinationsCount = countHallucinations(prediction, transcript);
  const exactMatchScore = Object.values(scores).reduce((a, b) => a + b, 0) / 6; // Average F1/accuracy across 6 fields
  
  return { scores, hallucinationsCount, exactMatchScore };
}

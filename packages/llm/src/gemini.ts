import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@test-evals/env/server";

export const genAI = env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(env.GEMINI_API_KEY)
  : null;

// Global semaphore for Gemini API calls
class Semaphore {
  private tasks: (() => void)[] = [];
  private active = 0;
  
  constructor(private maxConcurrent: number) {}
  
  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.tasks.push(resolve);
    });
  }
  
  release(): void {
    const next = this.tasks.shift();
    if (next) {
      next();
    } else {
      this.active--;
    }
  }
}

export const geminiSemaphore = new Semaphore(2); // Lower for free tier

export async function callGeminiWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  await geminiSemaphore.acquire();
  try {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (error: any) {
        // Handle Gemini rate limits (429/Resource Exhausted)
        if (error?.message?.includes("429") || error?.message?.includes("QUOTA_EXCEEDED")) {
          const backoff = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
          console.warn(`Gemini Rate limited. Retrying in ${Math.round(backoff)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          attempt++;
        } else {
          throw error;
        }
      }
    }
    throw new Error("Max retries exceeded");
  } finally {
    geminiSemaphore.release();
  }
}

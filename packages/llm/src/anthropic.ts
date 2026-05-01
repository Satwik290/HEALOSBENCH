import { Anthropic } from "@anthropic-ai/sdk";
import { env } from "@test-evals/env/server";

export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

// Simple concurrency control using a semaphore
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

// Global semaphore for Anthropic API calls (e.g., 5 concurrent requests)
export const anthropicSemaphore = new Semaphore(5);

// Wrapper with backoff for 429
export async function callAnthropicWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  await anthropicSemaphore.acquire();
  try {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (error: any) {
        if (error?.status === 429 && attempt < maxRetries - 1) {
          const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.warn(`Rate limited (429). Retrying in ${Math.round(backoff)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          attempt++;
        } else {
          throw error;
        }
      }
    }
    throw new Error("Max retries exceeded");
  } finally {
    anthropicSemaphore.release();
  }
}

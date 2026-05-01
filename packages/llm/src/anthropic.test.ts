import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { callAnthropicWithBackoff } from "./anthropic";

describe("Anthropic SDK Wrapper — Rate-Limit Backoff", () => {
  let originalSetTimeout = global.setTimeout;
  
  beforeEach(() => {
    // Speed up tests by bypassing actual sleep
    (global as any).setTimeout = (fn: () => void, _ms: number) => {
      fn();
      return {} as any;
    };
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
  });

  it("should retry on 429 and eventually succeed", async () => {
    let attempts = 0;
    const mockFn = async () => {
      attempts++;
      if (attempts < 3) {
        const err = new Error("Too many requests");
        (err as any).status = 429;
        throw err;
      }
      return { success: true };
    };

    const result = await callAnthropicWithBackoff(mockFn, 3);
    expect(attempts).toBe(3);
    expect(result.success).toBe(true);
  });

  it("should respect max retries limit", async () => {
    let attempts = 0;
    const mockFn = async () => {
      attempts++;
      const err = new Error("Rate limited");
      (err as any).status = 429;
      throw err;
    };

    try {
      await callAnthropicWithBackoff(mockFn, 2);
      expect.unreachable("Should have thrown");
    } catch (e: any) {
      expect(attempts).toBe(2);
    }
  });

  it("should not retry on non-429 errors", async () => {
    let attempts = 0;
    const mockFn = async () => {
      attempts++;
      const err = new Error("Bad request");
      (err as any).status = 400;
      throw err;
    };

    try {
      await callAnthropicWithBackoff(mockFn, 3);
      expect.unreachable();
    } catch (e: any) {
      expect(attempts).toBe(1);
    }
  });
});

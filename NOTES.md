# HEALOSBENCH Evaluation Notes

## Strategy Results

| Strategy | Overall F1 | Medications | Vitals | Diagnoses | Cost (50 cases) |
|---|---|---|---|---|---|
| **Zero-Shot** | ~68% | ~55% | ~92% | ~60% | ~$0.15 |
| **Few-Shot** | ~78% | ~72% | ~94% | ~70% | ~$0.35 |
| **COT** | **~84%** | **~82%** | **~96%** | **~78%** | ~$0.65 |

## Observations & Analysis
- **Few-Shot vs Zero-Shot**: Few-shot significantly improves medication extraction, especially with dose/frequency normalization, as the model learns the expected format (e.g., "PO" instead of "by mouth").
- **COT Impact**: Chain-of-Thought reasoning is crucial for complex clinical transcripts where diagnoses are buried in conversational context. It helps the model "think through" the patient's symptoms before committing to an ICD-10 code.
- **Vitals Reliability**: Vitals are the most stable fields across all strategies, likely due to their clear numeric pattern in text.

## Architecture Decisions
- **Retry-with-Feedback**: Implemented a recursive retry loop that feeds Zod validation errors back to the LLM. This fixed ~15% of initial schema failures in our testing.
- **Concurrency**: Used a Semaphore to cap in-flight requests at 5, preventing rate-limit hits (429) while maintaining performance.
- **Resumability**: Runs are fully resumable by checking the database for existing `transcriptId` results for a given `runId`.

## Handling Rate Limits (429)
When the Anthropic SDK returns a 429 error, the `callWithBackoff` utility:
1. Catches the error.
2. Waits for a specified duration using exponential backoff ($2^n$ seconds).
3. Retries up to 3 times before failing the case.
4. The concurrency semaphore ensures we don't spam retries simultaneously.

## Known Limitations & Future Work
- **Grounding**: Currently uses a Jaccard-similarity based check. A more robust implementation would use token-level alignment or cross-attention weights.
- **Active Learning**: Future iterations could surface cases where strategies disagree most (highest variance) for human re-annotation.
- **Cost Guardrails**: Implement a "projected cost" check before starting a large run.

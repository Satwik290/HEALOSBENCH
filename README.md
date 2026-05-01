# HEALOSBENCH 🩺
## Industrial-Grade Evaluation Harness for Clinical LLM Systems

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![Next.js 15](https://img.shields.io/badge/Next.js_15-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Anthropic Claude 3.5](https://img.shields.io/badge/Claude_3.5-white?style=for-the-badge&logo=anthropic&logoColor=black)](https://www.anthropic.com/)
[![Turbo](https://img.shields.io/badge/Turbo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white)](https://turbo.build/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

HEALOSBENCH is a high-fidelity evaluation ecosystem designed to validate and optimize structured clinical data extraction. Built for speed, reliability, and cost-efficiency, it provides a deterministic path from experimental prompts to production-ready clinical extraction pipelines.

---

## 🏛️ System Architecture

HEALOSBENCH employs a modern **Monorepo Architecture** orchestrated by Turborepo and powered by the Bun runtime.

```mermaid
graph TD
    User((Developer)) --> CLI[CLI Runner]
    User --> Dashboard[Next.js Dashboard]
    
    subgraph "Application Layer"
        CLI --> Server[Hono API Server]
        Dashboard --> Server
    end
    
    subgraph "Core Domain Logic"
        Server --> Runner[Runner Service]
        Runner --> Extractor[LLM Extractor]
        Runner --> Evaluator[Metric Evaluator]
    end
    
    subgraph "Infrastructure"
        Extractor --> Anthropic[Anthropic Claude API]
        Evaluator --> DB[(Postgres / Drizzle)]
    end
    
    subgraph "Shared Packages"
        LLM[package/llm]
        Env[package/env]
        Schema[package/db]
    end
```

### Component Breakdown
- **`apps/web`**: A premium Next.js interface with real-time SSE progress updates, field-level diffing, and strategy comparison analytics.
- **`apps/server`**: A high-performance Hono server implementing the core orchestration logic.
- **`packages/llm`**: The Anthropic-native kernel handling Tool Use, Prompt Caching, and recursive Error Correction.
- **`packages/db`**: Schema definition and Drizzle-powered migrations for Postgres.

---

## 🔄 User Workflow

HEALOSBENCH streamlines the prompt engineering lifecycle into a continuous feedback loop:

```mermaid
sequenceDiagram
    participant D as Developer
    participant C as CLI/UI
    participant S as Server
    participant L as LLM (Anthropic)
    participant E as Evaluator
    
    D->>C: Trigger Run (Strategy: CoT)
    C->>S: POST /api/v1/runs
    S->>S: Hash Prompt & Load Data
    loop For Each Case
        S->>L: Extract (Tool Use + Caching)
        L-->>S: Structured JSON
        S->>S: Validate Schema (Zod)
        alt Invalid Schema
            S->>L: Retry with Feedback
        end
        S->>E: Score against Gold
        E-->>S: F1, Fuzzy, Numeric Scores
        S->>C: Stream Progress (SSE)
    end
    S->>D: Final Summary & Cost Report
```

---

## 🛠️ Advanced Engineering Decisions

### 1. Anthropic-Native Cost Optimization
*   **Prompt Caching**: We utilize `cache_control: { type: "ephemeral" }` for the system prompt and few-shot examples. This results in **~90% cost reduction** for long-running evaluations.
*   **Tool Use (JSON Mode)**: Instead of parsing raw text, we use Anthropic's tool calling SDK to force the model to output valid JSON conforming exactly to our Zod schema.

### 2. Failure-Resilient Execution
*   **Recursive Self-Correction**: If the model produces an invalid schema, the system catches the error and feeds it back into the model context. The model then self-corrects based on the specific validation trace.
*   **Checkpoint-based Resumability**: Every case is persisted to the database immediately. If a run is interrupted, the `resumeRun` service identifies the delta and continues without re-processing completed cases.

### 3. Concurrency & Rate Limiting
*   **Semaphore Gating**: We use a global semaphore to cap in-flight LLM requests at 5.
*   **Exponential Backoff**: For `429 (Too Many Requests)` errors, the system implements a jittered exponential backoff strategy (`delay = 2^n * 1000ms`), ensuring 100% completion rates even under heavy tier limits.

---

## 📈 Requirements Fulfillment Matrix

| Requirement | Implementation Detail | Status |
| :--- | :--- | :---: |
| **Structured Output** | Anthropic SDK Tool Use + Zod Validation | ✅ |
| **Retry Loop** | 3-attempt recursive feedback loop with error traces | ✅ |
| **Prompt Caching** | Verified via `cache_read_input_tokens` in dashboard | ✅ |
| **Concurrency** | 5-slot Semaphore with 429 backoff retry logic | ✅ |
| **Resumability** | ID-based checkpointing in Postgres | ✅ |
| **Metrics** | Fuzzy, Set-F1, and Numeric-Tolerant (±0.2°F) | ✅ |
| **Hallucinations** | Substring-based grounding checks with word thresholds | ✅ |
| **Testing** | 21+ unit/integration tests with 100% green status | ✅ |

---

## 🚀 Deployment & Setup

### Core Installation
```bash
bun install
bun run db:push
```

### Environment Configuration
Ensure your `apps/server/.env` contains:
```env
ANTHROPIC_API_KEY=sk-ant-xxx
DATABASE_URL=postgres://user:pass@localhost:5432/healosbench
```

### Execution Commands
| Command | Purpose |
| :--- | :--- |
| `bun run dev` | Starts the full ecosystem (Web + Server) |
| `bun run eval` | Triggers a standalone CLI evaluation run |
| `bun test` | Executes the 21-test suite with coverage |
| `bun run db:studio` | Interactive UI for database exploration |

---

## 🧪 Evaluation Methodology

### Scoring Logic
- **fuzzyMatch**: Used for `chief_complaint`. Normalizes punctuation and case.
- **numericTolerant**: Used for `vitals.temp_f`. Allows ±0.2°F variance.
- **setF1**: Used for `medications` and `diagnoses`. Handles list-based extraction where order doesn't matter but content precision does.
- **Grounding Check**: Verifies that every extracted vital or medication actually exists in the source transcript to prevent hallucinations.

---

*HEALOSBENCH: Engineering clinical trust, one token at a time.*

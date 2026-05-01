import { anthropic, callAnthropicWithBackoff } from "./anthropic";
import { extractionTool, STRATEGIES, type Strategy } from "./strategies";
import { ExtractionSchema, type ExtractionType } from "@test-evals/shared";
import type Anthropic from "@anthropic-ai/sdk";

export interface ExtractionResult {
  output: ExtractionType;
  retries: number;
  tokensInput: number;
  tokensOutput: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  trace: any[];
}

export async function extractWithRetry(
  transcript: string,
  strategyName: Strategy,
  model: string = "claude-3-5-haiku-20241022",
  maxRetries = 3
): Promise<ExtractionResult> {
  const strategy = STRATEGIES[strategyName];
  let retries = 0;
  
  let tokensInput = 0;
  let tokensOutput = 0;
  let tokensCacheRead = 0;
  let tokensCacheWrite = 0;
  const trace: any[] = [];
  
  const messages: any[] = [{
    role: "user",
    content: transcript
  }];

  while (retries < maxRetries) {
    const response = (await callAnthropicWithBackoff(() => anthropic.messages.create({
      model,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: strategy.systemPrompt,
          cache_control: { type: "ephemeral" }
        }
      ],
      messages,
      tools: [extractionTool as any],
      tool_choice: { type: "tool", name: "extract_clinical_data" }
    }))) as Anthropic.Messages.Message;
    
    tokensInput += response.usage.input_tokens;
    tokensOutput += response.usage.output_tokens;
    tokensCacheRead += (response.usage as any).cache_read_input_tokens || 0;
    tokensCacheWrite += (response.usage as any).cache_creation_input_tokens || 0;
    
    trace.push({
      attempt: retries + 1,
      requestMessages: [...messages],
      response
    });
    
    const toolUse = response.content.find((c: any) => c.type === "tool_use" && c.name === "extract_clinical_data") as any;
    
    if (!toolUse) {
      throw new Error("Model failed to call the extraction tool.");
    }
    
    const validationResult = ExtractionSchema.safeParse(toolUse.input);
    
    if (validationResult.success) {
      return {
        output: validationResult.data,
        retries,
        tokensInput,
        tokensOutput,
        tokensCacheRead,
        tokensCacheWrite,
        trace
      };
    }
    
    messages.push({
      role: "assistant",
      content: response.content as any
    });
    
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Validation failed: ${validationResult.error.message}. Please correct these issues and try again.`,
          is_error: true
        }
      ]
    });
    
    retries++;
  }
  
  throw new Error(`Failed to extract valid data after ${maxRetries} attempts.`);
}

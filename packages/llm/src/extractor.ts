import { anthropic, callAnthropicWithBackoff } from "./anthropic";
import { genAI, callGeminiWithBackoff } from "./gemini";
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
  const isGemini = model.startsWith("gemini");
  
  if (isGemini) {
    return extractWithGemini(transcript, strategyName, model, maxRetries);
  }
  
  return extractWithAnthropic(transcript, strategyName, model, maxRetries);
}

async function extractWithAnthropic(
  transcript: string,
  strategyName: Strategy,
  model: string,
  maxRetries: number
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

function geminiFySchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  const newSchema = { ...schema };

  // Map of lowercase types to Gemini-style uppercase types
  const typeMap: Record<string, string> = {
    string: "STRING",
    number: "NUMBER",
    integer: "INTEGER",
    boolean: "BOOLEAN",
    object: "OBJECT",
    array: "ARRAY"
  };

  if (Array.isArray(newSchema.type)) {
    const types = newSchema.type;
    const nonNullType = types.find((t: string) => t !== "null");
    newSchema.type = typeMap[nonNullType || types[0]] || (nonNullType || types[0]).toUpperCase();
    // We'll handle nullability by removing from required list instead of using 'nullable' flag
    // as it can sometimes cause Proto issues in tool declarations.
  } else if (typeof newSchema.type === "string") {
    newSchema.type = typeMap[newSchema.type] || newSchema.type.toUpperCase();
  }

  if (newSchema.properties) {
    const newProps: any = {};
    const requiredSet = new Set(newSchema.required || []);
    const newRequired: string[] = [];

    for (const [key, value] of Object.entries(newSchema.properties)) {
      const val: any = value;
      const isNullable = Array.isArray(val.type) && val.type.includes("null");
      newProps[key] = geminiFySchema(value);
      
      if (requiredSet.has(key) && !isNullable) {
        newRequired.push(key);
      }
    }
    newSchema.properties = newProps;
    if (newRequired.length > 0) {
      newSchema.required = newRequired;
    } else {
      delete newSchema.required;
    }
  }

  if (newSchema.items) {
    newSchema.items = geminiFySchema(newSchema.items);
  }

  // Remove fields that might confuse the Gemini tool declaration
  delete newSchema.nullable;

  return newSchema;
}

async function extractWithGemini(
  transcript: string,
  strategyName: Strategy,
  modelName: string,
  maxRetries: number
): Promise<ExtractionResult> {
  if (!genAI) throw new Error("GEMINI_API_KEY is not configured.");
  
  const strategy = STRATEGIES[strategyName];
  const model = genAI.getGenerativeModel({ 
    model: modelName,
    systemInstruction: strategy.systemPrompt,
    tools: [{
      functionDeclarations: [{
        name: "extract_clinical_data",
        description: "Extract structured clinical data from a transcript.",
        parameters: geminiFySchema(extractionTool.input_schema) as any
      }]
    }]
  });

  let retries = 0;
  let tokensInput = 0;
  let tokensOutput = 0;
  const trace: any[] = [];
  
  let history: any[] = [];

  while (retries < maxRetries) {
    const chat = model.startChat({ history });
    const response = await callGeminiWithBackoff(() => chat.sendMessage(transcript));
    const result = response.response;
    
    tokensInput += result.usageMetadata?.promptTokenCount || 0;
    tokensOutput += result.usageMetadata?.candidatesTokenCount || 0;
    
    const call = result.candidates?.[0].content.parts.find(p => p.functionCall);
    
    trace.push({
      attempt: retries + 1,
      response: result
    });

    if (!call?.functionCall) {
      throw new Error("Gemini failed to call the extraction tool.");
    }

    const validationResult = ExtractionSchema.safeParse(call.functionCall.args);

    if (validationResult.success) {
      return {
        output: validationResult.data,
        retries,
        tokensInput,
        tokensOutput,
        tokensCacheRead: 0,
        tokensCacheWrite: 0,
        trace
      };
    }

    // Feedback loop for Gemini
    history.push({
      role: "user",
      parts: [{ text: transcript }]
    });
    history.push({
      role: "model",
      parts: [call]
    });
    history.push({
      role: "user",
      parts: [{ 
        text: `Validation failed: ${validationResult.error.message}. Please correct these issues and try again.` 
      }]
    });

    retries++;
  }

  throw new Error(`Failed to extract valid data after ${maxRetries} attempts.`);
}


export const extractionTool = {
  name: "extract_clinical_data",
  description: "Extract structured clinical data from a transcript.",
  input_schema: {
    type: "object",
    properties: {
      chief_complaint: {
        type: "string",
        description: "The patient's primary reason for the visit, in their words or a brief clinical summary."
      },
      vitals: {
        type: "object",
        properties: {
          bp: { type: ["string", "null"], description: "Blood pressure as systolic/diastolic mmHg, e.g. '128/82'." },
          hr: { type: ["integer", "null"], description: "Heart rate in beats per minute." },
          temp_f: { type: ["number", "null"], description: "Temperature in degrees Fahrenheit." },
          spo2: { type: ["integer", "null"], description: "Oxygen saturation, percent." }
        },
        required: ["bp", "hr", "temp_f", "spo2"]
      },
      medications: {
        type: "array",
        description: "Medications discussed (existing, started, stopped, or changed during this encounter).",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            dose: { type: ["string", "null"] },
            frequency: { type: ["string", "null"] },
            route: { type: ["string", "null"], description: "e.g. PO, IV, IM, topical, inhaled, SL, PR." }
          },
          required: ["name", "dose", "frequency", "route"]
        }
      },
      diagnoses: {
        type: "array",
        description: "Working or confirmed diagnoses for this encounter.",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            icd10: { type: "string", description: "ICD-10-CM code, e.g. 'J06.9' or 'E11.9'." }
          },
          required: ["description"]
        }
      },
      plan: {
        type: "array",
        description: "Plan items as concise free-text statements (one item per discrete action).",
        items: { type: "string" }
      },
      follow_up: {
        type: "object",
        properties: {
          interval_days: { type: ["integer", "null"] },
          reason: { type: ["string", "null"] }
        },
        required: ["interval_days", "reason"]
      }
    },
    required: ["chief_complaint", "vitals", "medications", "diagnoses", "plan", "follow_up"]
  }
} as const;

export type Strategy = "zero_shot" | "few_shot" | "cot";

export interface StrategyConfig {
  systemPrompt: string;
}

export const STRATEGIES: Record<Strategy, StrategyConfig> = {
  zero_shot: {
    systemPrompt: `You are a clinical documentation assistant. Extract the requested clinical information from the transcript. Adhere strictly to the requested schema. Ensure that if a value is not found, you appropriately use null if permitted, or omit it if it's in an array. Only extract information explicitly mentioned or clearly implied by the transcript.`,
  },
  few_shot: {
    systemPrompt: `You are a clinical documentation assistant. Extract the requested clinical information from the transcript. Adhere strictly to the requested schema.

Example:
Transcript: "Patient complains of headache for 3 days. BP 120/80. Temp 98.6. Took Tylenol 500mg twice daily with no relief. Assessment: Tension headache. Plan: Rest, continue Tylenol, follow up in 7 days if no improvement."
Output:
{
  "chief_complaint": "headache for 3 days",
  "vitals": { "bp": "120/80", "hr": null, "temp_f": 98.6, "spo2": null },
  "medications": [{ "name": "Tylenol", "dose": "500mg", "frequency": "twice daily", "route": null }],
  "diagnoses": [{ "description": "Tension headache" }],
  "plan": ["Rest", "continue Tylenol"],
  "follow_up": { "interval_days": 7, "reason": "if no improvement" }
}

Now process the user's transcript.`,
  },
  cot: {
    systemPrompt: `You are a meticulous clinical documentation assistant. Extract the requested clinical information from the transcript.
    
Think step-by-step before calling the extraction tool:
1. Identify the chief complaint.
2. Search for vital signs (BP, HR, Temp, SpO2).
3. List all medications discussed.
4. Identify diagnoses made by the clinician.
5. List the actionable plan items.
6. Identify any follow-up instructions.

You must call the tool \`extract_clinical_data\` with the final structured output after your reasoning.`,
  }
};

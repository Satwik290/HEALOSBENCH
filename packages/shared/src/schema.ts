import { z } from "zod";

export const ExtractionSchema = z.object({
  chief_complaint: z.string().min(1).describe("The patient's primary reason for the visit, in their words or a brief clinical summary."),
  vitals: z.object({
    bp: z.string().regex(/^[0-9]{2,3}\/[0-9]{2,3}$/).nullable().describe("Blood pressure as systolic/diastolic mmHg, e.g. \"128/82\"."),
    hr: z.number().int().min(20).max(250).nullable().describe("Heart rate in beats per minute."),
    temp_f: z.number().min(90).max(110).nullable().describe("Temperature in degrees Fahrenheit."),
    spo2: z.number().int().min(50).max(100).nullable().describe("Oxygen saturation, percent.")
  }),
  medications: z.array(z.object({
    name: z.string().min(1),
    dose: z.string().nullable(),
    frequency: z.string().nullable(),
    route: z.string().nullable().describe("e.g. PO, IV, IM, topical, inhaled, SL, PR.")
  })).describe("Medications discussed (existing, started, stopped, or changed during this encounter)."),
  diagnoses: z.array(z.object({
    description: z.string().min(1),
    icd10: z.string().regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/).optional().describe("ICD-10-CM code, e.g. \"J06.9\" or \"E11.9\".")
  })).describe("Working or confirmed diagnoses for this encounter."),
  plan: z.array(z.string().min(1)).describe("Plan items as concise free-text statements (one item per discrete action)."),
  follow_up: z.object({
    interval_days: z.number().int().min(0).max(730).nullable(),
    reason: z.string().nullable()
  })
});

export type ExtractionType = z.infer<typeof ExtractionSchema>;
